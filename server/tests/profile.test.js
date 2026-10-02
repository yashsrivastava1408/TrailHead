import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProfile, detectSkills } from '../src/services/profile.js';
import { sampleEvidence } from './helpers.js';

test('detectSkills does not confuse java with javascript', () => {
  assert.deepEqual([...detectSkills('I wrote JavaScript')].filter((s) => s === 'java'), []);
  assert.ok(detectSkills('Spring Boot and Java').has('java'));
});

test('detectSkills handles c++ and punctuation', () => {
  assert.ok(detectSkills('solved 200 problems in C++, Python').has('cpp'));
  assert.ok(detectSkills('using React.js/Node.js').has('react'));
});

test('buildProfile finds skills with evidence from languages, topics, files and resume', () => {
  const profile = buildProfile({ evidence: sampleEvidence(), resumeText: 'Skilled in SQL and Git' });
  const ids = profile.skills.map((s) => s.id);
  for (const expected of ['javascript', 'react', 'html-css', 'docker', 'ci-cd', 'testing', 'sql', 'git', 'mongodb']) {
    assert.ok(ids.includes(expected), `missing ${expected}`);
  }
  const react = profile.skills.find((s) => s.id === 'react');
  assert.ok(react.evidence.some((e) => e.startsWith('shop-ui')));
  assert.equal(profile.signals.deployedProjects, 1);
  assert.equal(profile.signals.hasDocker, true);
  assert.equal(profile.signals.resumeProvided, true);
  assert.equal(profile.lowEvidence, false);
});

test('evidence per skill is capped and has no duplicates', () => {
  const profile = buildProfile({ evidence: sampleEvidence() });
  for (const s of profile.skills) {
    assert.ok(s.evidence.length <= 4);
    assert.equal(new Set(s.evidence).size, s.evidence.length);
  }
});

test('a user with almost nothing is flagged as low evidence', () => {
  const evidence = { user: { login: 'new', name: 'New', publicRepos: 0 }, repos: [] };
  const profile = buildProfile({ evidence });
  assert.equal(profile.lowEvidence, true);
  assert.equal(profile.skills.length, 0);
});

test('tiny language shares are ignored', () => {
  const evidence = sampleEvidence();
  evidence.repos = [{ ...evidence.repos[0], languages: { JavaScript: 99_000, Python: 100 }, rootFiles: [], topics: [], description: '', homepage: null }];
  const ids = buildProfile({ evidence }).skills.map((s) => s.id);
  assert.ok(ids.includes('javascript'));
  assert.ok(!ids.includes('python'));
});

test('negated mentions are not claimed as skills ("I would rather avoid DSA" is not DSA experience)', () => {
  assert.ok(!detectSkills('I would rather avoid DSA-heavy roles').has('dsa'));
  assert.ok(!detectSkills('I dislike competitive programming').has('dsa'));
  assert.ok(!detectSkills('no experience with Docker').has('docker'));
  assert.ok(!detectSkills('Never used Kubernetes, scared of it').has('kubernetes'));
  assert.ok(!detectSkills('Strong, without any DSA background').has('dsa'));
});

test('real mentions still count, including after an earlier negated one', () => {
  assert.ok(detectSkills('Solved 300 DSA problems on LeetCode').has('dsa'));
  assert.ok(detectSkills('I avoid Java but love Docker').has('docker'), 'negation does not leak onto later words');
  assert.ok(detectSkills('I used to avoid React. Now I build with React daily.').has('react'), 'a later positive mention wins');
  assert.ok(detectSkills('Built 3 apps, no downtime, using Docker').has('docker'), '"no" alone is not a negator');
});

test('a resume that says it dislikes DSA does not raise the DSA path score', () => {
  const plain = buildProfile({ evidence: sampleEvidence(), resumeText: '' });
  const averse = buildProfile({ evidence: sampleEvidence(), resumeText: 'Final-year student. I would rather avoid DSA.' });
  assert.equal(averse.skills.some((s) => s.id === 'dsa'), false);
  assert.deepEqual(averse.skills.map((s) => s.id), plain.skills.map((s) => s.id));
});
