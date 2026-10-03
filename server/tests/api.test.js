import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cleanFromFacts, fakeLlm, startTestServer } from './helpers.js';
import { PATHS, getTask } from '../src/services/catalog.js';

// answers are one option index per question
const correctFor = (pathId) => getTask(pathId).questions.map((q) => String(q.correctOptionIndex));
const wrongFor = (pathId) => getTask(pathId).questions.map((q) => String((q.correctOptionIndex + 1) % q.options.length));

const planOf = (n = 30) => ({
  days: Array.from({ length: n }, (_, i) => ({ title: `Day ${i + 1} task`, task: `Do the thing number ${i + 1} properly`, minutes: 600, skill: 'React' })),
});

let t;
let llm;
before(async () => {
  llm = fakeLlm((kind, { user }) => {
    if (kind === 'explain') return cleanFromFacts(user);
    return planOf();
  });
  t = await startTestServer({ llm });
});
after(() => t.close());

test('health and config', async () => {
  assert.deepEqual((await t.call('GET', '/health')).body, { ok: true });
  const cfg = (await t.call('GET', '/config')).body;
  assert.equal(cfg.llm.model, 'fake-1');
});

test('input is validated', async () => {
  const bad = await t.call('POST', '/sessions', { githubUsername: 'not a user!' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error.message, /valid GitHub username/);
  assert.equal((await t.call('POST', '/sessions', { githubUsername: 'ada', freeHours: 99 })).status, 400);
  assert.equal((await t.call('GET', '/nope')).status, 404);
});

test('unknown GitHub user gives a clean 404', async () => {
  const res = await t.call('POST', '/sessions', { githubUsername: 'ghost-user' });
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'github_not_found');
});

test('unknown session gives 404', async () => {
  assert.equal((await t.call('GET', '/sessions/does-not-exist')).status, 404);
});

test('full journey: analyze -> taste test -> decide -> plan -> progress -> replan', async () => {
  // 1. analyze
  const created = await t.call('POST', '/sessions', { githubUsername: 'ada', resumeText: 'secret resume text with SQL', freeHours: 2, dislikesDsa: true });
  assert.equal(created.status, 201);
  const s = created.body;
  assert.equal(s.status, 'analyzed');
  assert.equal(s.analysis.ranking.length, PATHS.length);
  assert.equal(s.resumeText, undefined, 'resume must never be returned');
  assert.equal(s.plan, null);
  const top = s.analysis.ranking.slice(0, 3).map((r) => r.pathId);

  // 2. taste test: only top paths are offered, and the rubric stays hidden
  const task = await t.call('GET', `/sessions/${s.id}/tasks/${top[0]}`);
  assert.equal(task.status, 200);
  assert.equal(task.body.rubric, undefined);
  assert.equal(task.body.questions.length, 3, 'three questions per path');
  assert.ok(task.body.questions.every((q) => Array.isArray(q.options) && q.options.length >= 2 && q.brief));
  const wire = JSON.stringify(task.body);
  assert.ok(!wire.includes('correctOptionIndex'), 'the answer key must never be sent');
  for (const q of getTask(top[0]).questions) assert.ok(!wire.includes(q.explanation), 'explanations are only shown after answering');
  const notOffered = s.analysis.ranking.at(-1).pathId;
  assert.equal((await t.call('GET', `/sessions/${s.id}/tasks/${notOffered}`)).status, 400);
  assert.equal((await t.call('GET', `/sessions/${s.id}/tasks/not-a-path`)).status, 404);

  // decide before any trial is a conflict
  assert.equal((await t.call('POST', `/sessions/${s.id}/decision`, {})).status, 409);

  // answers are checked before anything is stored
  const callsBefore = llm.calls.length;
  const good = correctFor(top[0]);
  const badBodies = [[], good.slice(0, 2), [...good, '0'], ['abc', good[1], good[2]], ['-1', good[1], good[2]], ['1.5', good[1], good[2]], ['99', good[1], good[2]], ['', good[1], good[2]]];
  for (const answers of badBodies) {
    const res = await t.call('POST', `/sessions/${s.id}/trials`, { pathId: top[0], answers, enjoyment: 3 });
    assert.equal(res.status, 400, `answers ${JSON.stringify(answers)} must be rejected`);
  }
  assert.equal((await t.call('POST', `/sessions/${s.id}/trials`, { pathId: top[0], answer: '0', enjoyment: 3 })).status, 400, 'the old single-answer shape is refused');
  assert.equal((await t.call('GET', `/sessions/${s.id}`)).body.trials.length, 0, 'nothing stored for bad answers');

  // all right = 100, all wrong = 0, partly right = the share correct; the model is never involved
  const t1 = await t.call('POST', `/sessions/${s.id}/trials`, { pathId: top[0], answers: good, enjoyment: 2 });
  assert.equal(t1.status, 200);
  assert.equal(t1.body.trials[0].score, 100);
  assert.equal(t1.body.trials[0].feedback.right, 3);
  assert.match(t1.body.trials[0].feedback.feedback, /^Perfect/);
  assert.equal(t1.body.trials[0].feedback.review.length, 3);
  assert.ok(t1.body.trials[0].feedback.review.every((r) => r.isCorrect && r.explanation));
  assert.equal(t1.body.trials[0].answer, undefined);
  const t2 = await t.call('POST', `/sessions/${s.id}/trials`, { pathId: top[1], answers: wrongFor(top[1]), enjoyment: 5 });
  const wrong = t2.body.trials.find((x) => x.pathId === top[1]);
  assert.equal(wrong.score, 0);
  assert.ok(wrong.feedback.review.every((r) => !r.isCorrect && r.correctOption && r.explanation), 'a wrong answer reveals the best one and why');
  const partial = [correctFor(top[1])[0], ...wrongFor(top[1]).slice(1)];
  const t3 = await t.call('POST', `/sessions/${s.id}/trials`, { pathId: top[1], answers: partial, enjoyment: 4 });
  assert.equal(t3.body.trials.length, 2, 'retrying the same path replaces, it does not duplicate');
  assert.equal(t3.body.trials.find((x) => x.pathId === top[1]).score, 33, '1 of 3 correct');
  assert.equal(llm.calls.length, callsBefore, 'grading made no model calls');

  // 3. previewing a decision saves nothing
  const preview = await t.call('GET', `/sessions/${s.id}/decision`);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.options.length, 2);
  assert.equal((await t.call('GET', `/sessions/${s.id}`)).body.chosenPath, null);

  // decision, with an override that must be a tried path
  const decided = await t.call('POST', `/sessions/${s.id}/decision`, {});
  assert.equal(decided.body.status, 'decided');
  assert.equal(decided.body.decision.options.length, 2);
  assert.equal((await t.call('POST', `/sessions/${s.id}/decision`, { pathId: top[2] })).status, 400);
  const chosen = (await t.call('POST', `/sessions/${s.id}/decision`, { pathId: top[0] })).body;
  assert.equal(chosen.chosenPath, top[0]);
  assert.equal(chosen.decision.overridden, chosen.decision.recommended !== top[0]);

  // 4. plan (model plan; minutes capped to the 2h/day budget)
  const planned = await t.call('POST', `/sessions/${s.id}/plan`);
  assert.equal(planned.status, 201);
  assert.equal(planned.body.planSource, 'llm');
  assert.equal(planned.body.plan.days.length, 30);
  assert.ok(planned.body.plan.days.every((d) => d.minutes <= 120));
  assert.deepEqual(planned.body.plan.progress, { done: 0, total: 30 });

  // 5. progress + replan
  const done = await t.call('PATCH', `/sessions/${s.id}/plan/days/1`, { done: true });
  assert.deepEqual(done.body.plan.progress, { done: 1, total: 30 });
  assert.equal((await t.call('PATCH', `/sessions/${s.id}/plan/days/99`, { done: true })).status, 404);
  assert.equal((await t.call('PATCH', `/sessions/${s.id}/plan/days/1`, { done: 'yes' })).status, 400);
  const re = await t.call('POST', `/sessions/${s.id}/plan/replan`);
  assert.equal(re.status, 200);
  const days = re.body.plan.days;
  assert.equal(days[0].day, 1, 'finished task keeps its day');
  assert.equal(days[1].day, 1, 'pending tasks restart from today (day 1 on the first day)');
  assert.equal(days[29].day, 29);

  // state survives a fresh read
  const reread = (await t.call('GET', `/sessions/${s.id}`)).body;
  assert.equal(reread.status, 'planned');
  assert.equal(reread.plan.progress.done, 1);
});

test('plan falls back to code when the model returns a bad plan', async () => {
  const badLlm = fakeLlm((kind, { user }) => {
    if (kind === 'explain') return cleanFromFacts(user);
    throw new Error('plan model exploded');
  });
  const t2 = await startTestServer({ llm: badLlm });
  try {
    const s = (await t2.call('POST', '/sessions', { githubUsername: 'ada' })).body;
    const top = s.analysis.ranking[0].pathId;
    await t2.call('POST', `/sessions/${s.id}/trials`, { pathId: top, answers: correctFor(top), enjoyment: 4 });
    await t2.call('POST', `/sessions/${s.id}/decision`, {});
    const planned = await t2.call('POST', `/sessions/${s.id}/plan`);
    assert.equal(planned.status, 201);
    assert.equal(planned.body.planSource, 'fallback');
    assert.match(planned.body.planNote, /exploded/);
    assert.equal(planned.body.plan.days.length, 30);
  } finally {
    await t2.close();
  }
});

test('planning before choosing a path is a conflict, and so is replanning with no plan', async () => {
  const s = (await t.call('POST', '/sessions', { githubUsername: 'ada' })).body;
  assert.equal((await t.call('POST', `/sessions/${s.id}/plan`)).status, 409);
  assert.equal((await t.call('POST', `/sessions/${s.id}/plan/replan`)).status, 409);
});

test('with no model at all, analysis degrades and the taste test still works (grading needs no model)', async () => {
  const down = fakeLlm(() => null, { isConfigured: false });
  down.completeJson = async () => {
    const { AppError } = await import('../src/errors.js');
    throw new AppError(503, 'LLM is not configured. Set the API key', 'llm_unconfigured');
  };
  const t3 = await startTestServer({ llm: down });
  try {
    const created = await t3.call('POST', '/sessions', { githubUsername: 'ada' });
    assert.equal(created.status, 201);
    assert.equal(created.body.analysis.meta.usedFallback, true);
    const top = created.body.analysis.ranking[0].pathId;
    const graded = await t3.call('POST', `/sessions/${created.body.id}/trials`, { pathId: top, answers: correctFor(top), enjoyment: 3 });
    assert.equal(graded.status, 200);
    assert.equal(graded.body.trials[0].score, 100);
    await t3.call('POST', `/sessions/${created.body.id}/decision`, {});
    const plan = await t3.call('POST', `/sessions/${created.body.id}/plan`);
    assert.equal(plan.status, 201);
    assert.equal(plan.body.planSource, 'fallback', 'no model: the template plan is used');
  } finally {
    await t3.close();
  }
});
