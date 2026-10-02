import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProfile } from '../src/services/profile.js';
import { scorePaths } from '../src/services/scoring.js';
import { sampleEvidence } from './helpers.js';

const profile = buildProfile({ evidence: sampleEvidence() });

test('every path gets a fit between 0 and 100 and matched/missing partition the skills', () => {
  for (const r of scorePaths(profile)) {
    assert.ok(r.fit >= 0 && r.fit <= 100);
    assert.ok(r.matched.length + r.missing.length > 0);
    const ids = [...r.matched, ...r.missing].map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test('a web-heavy profile ranks full-stack above the DSA path', () => {
  const ranking = scorePaths(profile);
  const index = (id) => ranking.findIndex((r) => r.pathId === id);
  assert.ok(index('fullstack') < index('product-sde'));
});

test('disliking DSA lowers the rank of DSA-heavy paths only', () => {
  const neutral = scorePaths(profile, { dislikesDsa: false }).find((r) => r.pathId === 'product-sde');
  const averse = scorePaths(profile, { dislikesDsa: true }).find((r) => r.pathId === 'product-sde');
  assert.equal(neutral.fit, averse.fit);
  assert.ok(averse.rankScore <= neutral.rankScore);
  const qaA = scorePaths(profile, { dislikesDsa: true }).find((r) => r.pathId === 'qa-sdet');
  const qaN = scorePaths(profile, { dislikesDsa: false }).find((r) => r.pathId === 'qa-sdet');
  assert.equal(qaA.rankScore, qaN.rankScore);
});

test('the ranking is sorted by rankScore, descending', () => {
  const scores = scorePaths(profile, { dislikesDsa: true }).map((r) => r.rankScore);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
});
