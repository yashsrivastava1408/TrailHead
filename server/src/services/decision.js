import { conflict } from '../errors.js';

// How the three signals are weighted. Kept visible so the student can see why a path won.
export const WEIGHTS = { fit: 0.4, performance: 0.35, enjoyment: 0.25 };

/** Maps a 1-5 enjoyment rating to 0-100. */
const enjoymentPercent = (rating) => ((rating - 1) / 4) * 100;

/**
 * Combines what the student's work shows (fit), how they did on the trial
 * (performance) and how much they liked it (enjoyment).
 * Only paths that were actually tried are ranked: no trial, no verdict.
 */
export function computeDecision({ ranking, trials }) {
  if (trials.length === 0) throw conflict('Try at least one taste test before deciding');

  const fitByPath = new Map(ranking.map((r) => [r.pathId, r]));
  const options = trials
    .filter((t) => fitByPath.has(t.pathId))
    .map((t) => {
      const path = fitByPath.get(t.pathId);
      const parts = { fit: path.rankScore, performance: t.score, enjoyment: Math.round(enjoymentPercent(t.enjoyment)) };
      const combined = Math.round(
        WEIGHTS.fit * parts.fit + WEIGHTS.performance * parts.performance + WEIGHTS.enjoyment * parts.enjoyment,
      );
      return { pathId: t.pathId, name: path.name, combined, ...parts };
    })
    .sort((a, b) => b.combined - a.combined);

  const [best] = options;
  return {
    weights: WEIGHTS,
    options,
    recommended: best.pathId,
    reason: `${best.name} scored highest overall (${best.combined}/100): fit ${best.fit}, trial ${best.performance}, enjoyment ${best.enjoyment}.`,
  };
}
