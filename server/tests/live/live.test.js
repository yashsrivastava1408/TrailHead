/**
 * LIVE tests: real GitHub + the real model from server/.env. They cost a few API calls.
 * Run with:  npm run test:live      (optional: LIVE_GITHUB_USER=<username>)
 * Skipped in the normal `npm test`.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../src/config/index.js';
import { createLlm } from '../../src/llm/client.js';
import { createGithubClient } from '../../src/services/github.js';
import { getTask, PATHS } from '../../src/services/catalog.js';
import { startTestServerWith } from './live-helpers.js';

const LIVE = process.env.LIVE === '1';
const USER = process.env.LIVE_GITHUB_USER || 'sindresorhus';
const opts = { skip: !LIVE && 'set LIVE=1 (npm run test:live)', timeout: 400_000 };
const pause = (ms = Number(process.env.LIVE_PAUSE_MS ?? 6000)) => new Promise((r) => setTimeout(r, ms));

let t;
let llm;
let session;

before(async () => {
  if (!LIVE) return;
  const config = loadConfig();
  llm = createLlm(config.llm);
  t = await startTestServerWith({ llm, github: createGithubClient({ token: config.githubToken }) });
});
after(async () => { await t?.close(); });

test('the configured model exists for this API key', opts, async () => {
  const ok = await llm.checkModel();
  assert.equal(ok, true, `model "${llm.model}" is not available. Available: ${llm.availableModels.join(', ')}`);
});

test(`real analysis of github.com/${USER}: clean explanation, no fallback, every claim backed by evidence`, opts, async () => {
  const res = await t.call('POST', '/sessions', { githubUsername: USER, resumeText: 'Final-year student. JavaScript, SQL, Git.', freeHours: 2, dislikesDsa: true });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  session = res.body;

  const { meta, explanations, ranking } = session.analysis;
  assert.equal(meta.usedFallback, false, `fell back to code-only text: ${meta.llmError}`);
  assert.ok(meta.attempts >= 1 && meta.attempts <= 3);
  assert.deepEqual(explanations.map((e) => e.pathId), ranking.slice(0, 3).map((r) => r.pathId));

  const evidence = new Map(session.profile.skills.map((s) => [s.id, s.evidence.map((e) => e.toLowerCase())]));
  for (const e of explanations) {
    assert.ok(e.summary.length > 0 && e.summary.length <= 280);
    for (const s of e.strengths) assert.ok(evidence.get(s.skill)?.includes(s.evidence.toLowerCase()), `unbacked claim: ${s.skill} / ${s.evidence}`);
  }
  console.log(`      model=${meta.model} attempts=${meta.attempts} top=${ranking[0].name} (${ranking[0].fit}%)`);
});

const rightAnswers = (pathId) => getTask(pathId).questions.map((q) => String(q.correctOptionIndex));
const wrongAnswers = (pathId) => getTask(pathId).questions.map((q) => String((q.correctOptionIndex + 1) % q.options.length));

test('taste tests are graded by code: all right = 100, all wrong = 0, bad input = 400, key never leaked', opts, async () => {
  const top = session.analysis.ranking[0].pathId;
  const served = (await t.call('GET', `/sessions/${session.id}/tasks/${top}`)).body;
  assert.equal(served.questions.length, 3);
  assert.ok(!JSON.stringify(served).includes('correctOptionIndex'));
  for (const q of getTask(top).questions) assert.ok(!JSON.stringify(served).includes(q.explanation));

  const right = await t.call('POST', `/sessions/${session.id}/trials`, { pathId: top, answers: rightAnswers(top), enjoyment: 4 });
  assert.equal(right.status, 200, JSON.stringify(right.body));
  assert.equal(right.body.trials.find((x) => x.pathId === top).score, 100);

  const second = session.analysis.ranking[1].pathId;
  const wrong = await t.call('POST', `/sessions/${session.id}/trials`, { pathId: second, answers: wrongAnswers(second), enjoyment: 2 });
  assert.equal(wrong.body.trials.find((x) => x.pathId === second).score, 0);

  assert.equal((await t.call('POST', `/sessions/${session.id}/trials`, { pathId: second, answers: ['99', '0', '0'], enjoyment: 2 })).status, 400);
});

test('all 9 paths have a complete 3-question task with a valid answer key', opts, async () => {
  assert.equal(PATHS.length, 9);
  for (const { id } of PATHS) {
    assert.equal(getTask(id).questions.length, 3, id);
    assert.equal(rightAnswers(id).length, 3, id);
  }
});

test('decision then a real 30-day plan that respects the daily budget and the student\'s stack', opts, async () => {
  await pause(30_000); // let the per-minute token budget refill before the biggest call
  const dec = await t.call('POST', `/sessions/${session.id}/decision`, {});
  assert.equal(dec.status, 200);
  const res = await t.call('POST', `/sessions/${session.id}/plan`);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.planSource, 'llm', `plan fell back: ${res.body.planNote}`);

  const days = res.body.plan.days;
  assert.equal(days.length, 30);
  assert.ok(days.every((d) => d.minutes <= 120 && d.title && d.task));
  const text = days.map((d) => `${d.title} ${d.task}`).join(' ');
  // regression: an earlier prompt wrote "Dockerfile for Flask app" for a JavaScript developer
  assert.doesNotMatch(text, /\b(flask|django|spring boot)\b/i, 'plan switched the student to a stack they have not used');
});

test('the journey survives a restart-style reread, and ticking days works', opts, async () => {
  const done = await t.call('PATCH', `/sessions/${session.id}/plan/days/1`, { done: true });
  assert.deepEqual(done.body.plan.progress, { done: 1, total: 30 });
  const again = (await t.call('GET', `/sessions/${session.id}`)).body;
  assert.equal(again.status, 'planned');
  assert.equal(again.resumeText, undefined);
});
