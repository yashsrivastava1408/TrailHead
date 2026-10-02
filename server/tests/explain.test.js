import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProfile } from '../src/services/profile.js';
import { scorePaths } from '../src/services/scoring.js';
import { buildAllowedFacts, fallbackExplanations, validateExplanations } from '../src/services/explain.js';
import { getPath } from '../src/services/catalog.js';
import { sampleEvidence } from './helpers.js';

const profile = buildProfile({ evidence: sampleEvidence() });
const ranking = scorePaths(profile, { dislikesDsa: true });
const facts = buildAllowedFacts(profile, ranking);

const clean = () => ({
  paths: facts.map((f) => ({
    pathId: f.pathId,
    summary: 'Looks like a good match.',
    strengths: f.matched.slice(0, 1).map((m) => ({ skill: m.skill, evidence: m.evidence[0] })),
    gaps: f.missing.slice(0, 1),
  })),
});

test('a clean explanation passes the checker', () => {
  assert.deepEqual(validateExplanations(clean(), facts), []);
});

test('the fallback explanation always passes the checker', () => {
  assert.deepEqual(validateExplanations(fallbackExplanations(facts), facts), []);
});

test('a strength the student does not have is rejected', () => {
  const bad = clean();
  bad.paths[0].strengths.push({ skill: 'kubernetes', evidence: 'invented-repo: uses k8s' });
  assert.ok(validateExplanations(bad, facts).some((e) => e.includes('"kubernetes"')));
});

test('evidence that is not copied exactly is rejected', () => {
  const bad = clean();
  bad.paths[0].strengths[0].evidence = 'I built this amazing project';
  assert.ok(validateExplanations(bad, facts).some((e) => e.includes('not copied exactly')));
});

test('a gap outside the missing list is rejected', () => {
  const bad = clean();
  bad.paths[0].gaps = ['react'];
  assert.ok(validateExplanations(bad, facts).some((e) => e.includes('not in the missing list')));
});

test('a summary that boasts about an unrelated skill is rejected', () => {
  const bad = clean();
  // pick a listed path that does not involve infrastructure-as-code, then boast about it
  const target = bad.paths.find((p) => !getPath(p.pathId).skills.some((s) => s.id === 'iac'));
  target.summary = 'Great with Terraform.';
  assert.ok(validateExplanations(bad, facts).some((e) => e.includes('summary mentions')));
});

test('a missing path entry is reported', () => {
  const bad = clean();
  bad.paths.pop();
  assert.ok(validateExplanations(bad, facts).some((e) => e.startsWith('Missing entry')));
});
