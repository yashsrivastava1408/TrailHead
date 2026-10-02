import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDecision } from '../src/services/decision.js';
import { PLAN_DAYS, fallbackPlan, planProgress, planSchema, replan, todayIndex } from '../src/services/plan.js';
import { getPath } from '../src/services/catalog.js';

const ranking = [
  { pathId: 'fullstack', name: 'Web', rankScore: 80 },
  { pathId: 'qa-sdet', name: 'QA', rankScore: 50 },
];

test('decision needs at least one trial', () => {
  assert.throws(() => computeDecision({ ranking, trials: [] }), /taste test/);
});

test('decision blends fit, trial score and enjoyment, and enjoyment can flip the winner', () => {
  const trials = [
    { pathId: 'fullstack', score: 50, enjoyment: 1 },
    { pathId: 'qa-sdet', score: 90, enjoyment: 5 },
  ];
  const d = computeDecision({ ranking, trials });
  assert.equal(d.recommended, 'qa-sdet');
  // qa: 0.4*50 + 0.35*90 + 0.25*100 = 76.5 -> 77 ; web: 0.4*80 + 0.35*50 + 0 = 49.5 -> 50
  assert.deepEqual(d.options.map((o) => o.combined), [77, 50]);
  assert.equal(d.options[0].enjoyment, 100);
  assert.equal(d.options[1].enjoyment, 0);
});

test('the fallback plan has 30 valid days that respect daily time', () => {
  const path = getPath('qa-sdet');
  const days = fallbackPlan({ path, missing: ['Selenium', 'CI/CD'], freeHours: 1 });
  assert.equal(days.length, PLAN_DAYS);
  assert.ok(days.every((d) => d.minutes <= 60));
  assert.equal(planSchema.safeParse({ days }).success, true);
});

test('the fallback plan works when nothing is missing', () => {
  const days = fallbackPlan({ path: getPath('fullstack'), missing: [], freeHours: 3 });
  assert.equal(days.length, PLAN_DAYS);
});

test('planSchema rejects the wrong number of days', () => {
  assert.equal(planSchema.safeParse({ days: [] }).success, false);
});

test('replan puts unfinished tasks on consecutive days starting today and leaves done ones alone', () => {
  const days = [
    { seq: 1, day: 1, done: true },
    { seq: 2, day: 2, done: false },
    { seq: 3, day: 3, done: false },
    { seq: 4, day: 4, done: true },
    { seq: 5, day: 5, done: false },
  ];
  assert.deepEqual(replan(days, 6), [{ seq: 2, day: 6 }, { seq: 3, day: 7 }, { seq: 5, day: 8 }]);
  assert.deepEqual(planProgress(days), { done: 2, total: 5 });
});

test('todayIndex counts days from the start, never below 1', () => {
  const start = Date.UTC(2026, 9, 1);
  assert.equal(todayIndex(start, start), 1);
  assert.equal(todayIndex(start, start + 3 * 86_400_000 + 5), 4);
  assert.equal(todayIndex(start, start - 1000), 1);
});
