import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeTrial, parseAnswers } from '../src/services/trials.js';
import { PATHS, SKILLS, getTask } from '../src/services/catalog.js';
import { buildProfile, detectSkills } from '../src/services/profile.js';
import { scorePaths } from '../src/services/scoring.js';
import { sampleEvidence } from './helpers.js';

const q = (correctOptionIndex) => ({ brief: 'Q?', options: ['A', 'B', 'C', 'D'], correctOptionIndex, explanation: `Because ${'ABCD'[correctOptionIndex]}.` });
const task = { questions: [q(2), q(0), q(3)] };

test('parseAnswers needs one valid option per question, in order', () => {
  assert.deepEqual(parseAnswers(task, ['2', '0', '3']), [2, 0, 3]);
  assert.deepEqual(parseAnswers(task, [' 1 ', 1, '0']), [1, 1, 0]);
  const rejected = [[], ['0'], ['0', '0'], ['0', '0', '0', '0'], 'abc', null, ['abc', '0', '0'], ['-1', '0', '0'], ['1.5', '0', '0'], ['4', '0', '0'], ['99', '0', '0'], ['', '0', '0'], ['0x1', '0', '0'], ['1e1', '0', '0']];
  for (const bad of rejected) assert.throws(() => parseAnswers(task, bad), (e) => e.status === 400, `${JSON.stringify(bad)} must be rejected`);
});

test('the score is the share of questions answered correctly', () => {
  assert.equal(gradeTrial({ task, answers: ['2', '0', '3'] }).score, 100);
  assert.equal(gradeTrial({ task, answers: ['2', '0', '0'] }).score, 67);
  assert.equal(gradeTrial({ task, answers: ['2', '1', '0'] }).score, 33);
  assert.equal(gradeTrial({ task, answers: ['0', '1', '0'] }).score, 0);
});

test('the review reveals the best answer and the explanation for every question, after answering', () => {
  const r = gradeTrial({ task, answers: ['2', '1', '0'] });
  assert.equal(r.right, 1);
  assert.equal(r.total, 3);
  assert.deepEqual(r.review.map((x) => x.isCorrect), [true, false, false]);
  assert.equal(r.review[1].chosen, 'B');
  assert.equal(r.review[1].correctOption, 'A');
  assert.equal(r.review[1].explanation, 'Because A.');
  assert.match(gradeTrial({ task, answers: ['2', '0', '3'] }).feedback, /^Perfect/);
  assert.match(r.feedback, /1 of 3/);
});

test('every path has a well-formed 3-question task (data integrity)', () => {
  for (const p of PATHS) {
    const t = getTask(p.id);
    assert.ok(t, `${p.id} has no task`);
    assert.ok(t.title && Number.isInteger(t.minutes) && t.minutes > 0);
    assert.equal(t.questions.length, 3, `${p.id}: 3 questions`);
    for (const [i, x] of t.questions.entries()) {
      const where = `${p.id} Q${i + 1}`;
      assert.ok(x.brief.trim() && x.explanation.trim(), `${where}: missing text`);
      assert.ok(x.options.length >= 3 && x.options.length <= 5, `${where}: 3-5 options`);
      assert.equal(new Set(x.options).size, x.options.length, `${where}: duplicate options`);
      assert.ok(x.options.every((o) => o.trim()), `${where}: blank option`);
      assert.ok(Number.isInteger(x.correctOptionIndex) && x.correctOptionIndex >= 0 && x.correctOptionIndex < x.options.length, `${where}: correct index out of range`);
    }
  }
});

test('correct answers are spread across positions, so "always pick B" does not work', () => {
  const all = PATHS.flatMap((p) => getTask(p.id).questions);
  const counts = [0, 1, 2, 3].map((i) => all.filter((x) => x.correctOptionIndex === i).length);
  const min = Math.floor(all.length * 0.15);
  counts.forEach((c, i) => assert.ok(c >= min, `position ${i} is the answer only ${c} of ${all.length} times: ${counts}`));
  for (const p of PATHS) {
    const positions = getTask(p.id).questions.map((x) => x.correctOptionIndex);
    assert.ok(new Set(positions).size >= 2, `${p.id}: all three answers are in the same position`);
  }
});

test('the quiz time shown matches the number of questions', () => {
  for (const p of PATHS) assert.equal(getTask(p.id).minutes, getTask(p.id).questions.length, `${p.id}: about one minute per question`);
});

test('every skill a path needs exists in the skills catalog, and every skill has aliases', () => {
  for (const p of PATHS) for (const s of p.skills) assert.ok(SKILLS[s.id], `${p.id} needs unknown skill ${s.id}`);
  for (const [id, def] of Object.entries(SKILLS)) assert.ok(def.aliases.length > 0 && def.label, `${id} is incomplete`);
});

test('every skill is used by at least one path, so it can never be "decoration" on the evidence page', () => {
  const used = new Set(PATHS.flatMap((p) => p.skills.map((s) => s.id)));
  const unused = Object.keys(SKILLS).filter((id) => !used.has(id));
  assert.deepEqual(unused, [], `skills no path uses: ${unused}`);
});

const withSkills = (resumeText) => scorePaths(buildProfile({ evidence: { user: { login: 'x', name: 'X', publicRepos: 0 }, repos: [] }, resumeText }));
const fit = (ranking, id) => ranking.find((r) => r.pathId === id).fit;

test('the newer skills now change the scores of the paths that need them', () => {
  assert.ok(fit(withSkills('Node.js, Golang, Redis, Prisma, GraphQL'), 'backend') > fit(withSkills('Node.js'), 'backend'));
  assert.ok(fit(withSkills('React, TypeScript, Firebase, GraphQL, WebSockets'), 'fullstack') > fit(withSkills('React'), 'fullstack'));
});

test('a Flutter / Firebase student ranks Mobile App Developer first', () => {
  const ranking = withSkills('Built apps with Flutter and Firebase, React Native, TypeScript, Git, REST APIs');
  assert.equal(ranking[0].pathId, 'mobile');
  assert.ok(fit(ranking, 'mobile') > fit(withSkills('React'), 'mobile'));
});

test('a mobile mention does not make a non-mobile student a mobile developer', () => {
  const ranking = withSkills('I use Git and SQL');
  assert.ok(fit(ranking, 'mobile') < 30);
});

test('everyday words never claim a skill (aliases must be specific)', () => {
  const everyday = ['Time to go home', "let's go build it", 'clear the browser cache', 'auth middleware for the API', 'a swift response', 'real-time updates', 'relay the message',
    'fiber optic cable', 'a gin and tonic', 'the main branch of the tree', 'we express our thanks', 'a rest after lunch', 'swift and secure', 'the expo was fun', 'ios'];
  for (const text of everyday) {
    const hits = [...detectSkills(text)].filter((id) => id !== 'rest-api');
    assert.deepEqual(hits, [], `"${text}" wrongly claims: ${hits}`);
  }
});

test('the newer skills are still found when mentioned specifically', () => {
  const cases = { go: 'I write Golang services', redis: 'Redis for sessions', firebase: 'Firebase auth and Firestore', graphql: 'GraphQL with Apollo Client',
    websockets: 'chat over socket.io', mobile: 'Flutter and Kotlin apps', prisma: 'Prisma and Postgres', rust: 'Rust with Tokio', express: 'an Express server' };
  for (const [id, text] of Object.entries(cases)) assert.ok(detectSkills(text).has(id), `"${text}" should find ${id}`);
});
