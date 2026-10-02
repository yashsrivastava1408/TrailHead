import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnalyzeGraph } from '../src/graph/analyze.js';
import { cleanFromFacts, fakeGithub, fakeLlm } from './helpers.js';

const run = (llm, extra = {}) =>
  createAnalyzeGraph({ github: fakeGithub(), llm, ...extra }).run({ username: 'ada', resumeText: '', dislikesDsa: true });

test('happy path: one model call, no fallback', async () => {
  const llm = fakeLlm((_k, { user }) => cleanFromFacts(user));
  const { analysis, profile } = await run(llm);
  assert.equal(analysis.meta.attempts, 1);
  assert.equal(analysis.meta.usedFallback, false);
  assert.equal(profile.username, 'ada');
  assert.equal(analysis.explanations.length, 3);
  assert.ok(analysis.explanations[0].strengths.every((s) => s.label));
});

test('the checker rejects an invented claim and the graph retries with the problems listed', async () => {
  const llm = fakeLlm((_k, { user, calls }) => {
    const good = cleanFromFacts(user);
    if (calls === 1) good.paths[0].strengths.push({ skill: 'kubernetes', evidence: 'made-up' });
    return good;
  });
  const { analysis } = await run(llm);
  assert.equal(analysis.meta.attempts, 2);
  assert.equal(analysis.meta.usedFallback, false);
  assert.ok(llm.calls[1].user.includes('previous answer had these problems'));
  assert.ok(llm.calls[1].user.includes('kubernetes'));
});

test('after repeated bad answers the graph uses the code-only fallback', async () => {
  const llm = fakeLlm((_k, { user }) => {
    const bad = cleanFromFacts(user);
    bad.paths[0].gaps = ['not-a-skill'];
    return bad;
  });
  const { analysis } = await run(llm, { maxAttempts: 2 });
  assert.equal(llm.calls.length, 2);
  assert.equal(analysis.meta.usedFallback, true);
  assert.ok(analysis.explanations.every((e) => e.summary.length > 0));
});

test('if the model is down the analysis still returns, and says why', async () => {
  const llm = fakeLlm(() => { throw new Error('boom'); });
  llm.completeJson = async () => { throw new Error('LLM is not configured'); };
  const { analysis } = await run(llm);
  assert.equal(analysis.meta.usedFallback, true);
  assert.equal(analysis.meta.attempts, 0);
  assert.match(analysis.meta.llmError, /not configured/);
  assert.equal(analysis.ranking.length, 8);
});
