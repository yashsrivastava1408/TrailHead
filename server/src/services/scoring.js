import { PATHS, skillLabel } from './catalog.js';

// Points taken off a path's rank when the student said they dislike DSA.
const DSA_PENALTY = { high: 25, medium: 5, low: 0 };

/**
 * Ranks every career path against a profile. Pure code, no AI:
 * fit = share of the path's weighted skills the student already shows.
 * The numbers are therefore reproducible and cannot be invented by a model.
 */
export function scorePaths(profile, { dislikesDsa = false } = {}) {
  const have = new Set(profile.skills.map((s) => s.id));

  const ranking = PATHS.map((path) => {
    const total = path.skills.reduce((sum, s) => sum + s.weight, 0);
    const matchedSkills = path.skills.filter((s) => have.has(s.id));
    const gained = matchedSkills.reduce((sum, s) => sum + s.weight, 0);
    const fit = Math.round((gained / total) * 100);
    const penalty = dislikesDsa ? DSA_PENALTY[path.dsaLevel] : 0;

    return {
      pathId: path.id,
      name: path.name,
      summary: path.summary,
      dsaLevel: path.dsaLevel,
      fit,
      rankScore: Math.max(0, fit - penalty),
      matched: matchedSkills.map((s) => ({ id: s.id, label: skillLabel(s.id) })),
      missing: path.skills
        .filter((s) => !have.has(s.id))
        .sort((a, b) => b.weight - a.weight)
        .map((s) => ({ id: s.id, label: skillLabel(s.id) })),
    };
  });

  return ranking.sort((a, b) => b.rankScore - a.rankScore || b.fit - a.fit);
}
