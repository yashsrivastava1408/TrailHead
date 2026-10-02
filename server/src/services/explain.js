import { z } from 'zod';
import { detectSkills } from './profile.js';
import { SKILLS, getPath, skillLabel } from './catalog.js';

export const TOP_N = 3;
const MAX_STRENGTHS = 3;
const MAX_GAPS = 4;
const MAX_SUMMARY = 280;

export const explanationSchema = z.object({
  paths: z.array(
    z.object({
      pathId: z.string(),
      summary: z.string(),
      strengths: z.array(z.object({ skill: z.string(), evidence: z.string() })),
      gaps: z.array(z.string()),
    }),
  ),
});

const norm = (s) => s.trim().toLowerCase();

/** What the model is allowed to cite. Anything outside this list is rejected. */
export function buildAllowedFacts(profile, ranking) {
  const evidenceBySkill = new Map(profile.skills.map((s) => [s.id, s.evidence]));
  return ranking.slice(0, TOP_N).map((r) => ({
    pathId: r.pathId,
    name: r.name,
    fit: r.fit,
    matched: r.matched.map((m) => ({ skill: m.id, evidence: evidenceBySkill.get(m.id) ?? [] })),
    missing: r.missing.map((m) => m.id),
  }));
}

export function buildExplainPrompt(facts, previousErrors = []) {
  const system = [
    'You are a career guide for a final-year college student.',
    'Explain, for each path, why it fits using ONLY the facts given. Never invent projects, skills or experience.',
    'For each path write: "summary" (max 2 short sentences, plain words), "strengths" (up to 3 items; "skill" must be a skill id from that path\'s matched list and "evidence" must be copied EXACTLY from that skill\'s evidence list), and "gaps" (up to 4 skill ids copied from that path\'s missing list).',
    'Do not mention skills in the summary that are not in the matched or missing lists.',
    'JSON shape: {"paths":[{"pathId":"","summary":"","strengths":[{"skill":"","evidence":""}],"gaps":[""]}]}',
  ].join('\n');
  const fixes = previousErrors.length
    ? `\n\nYour previous answer had these problems. Fix all of them:\n- ${previousErrors.join('\n- ')}`
    : '';
  return { system, user: `Facts:\n${JSON.stringify(facts, null, 2)}${fixes}` };
}

/**
 * The checker. Returns a list of problems (empty list = the answer is clean).
 * It rejects any claim that is not backed by evidence found in the student's profile.
 */
export function validateExplanations(explanations, facts) {
  const errors = [];
  const byId = new Map(explanations.paths.map((p) => [p.pathId, p]));

  for (const fact of facts) {
    const exp = byId.get(fact.pathId);
    if (!exp) {
      errors.push(`Missing entry for path "${fact.pathId}"`);
      continue;
    }
    const allowedEvidence = new Map(fact.matched.map((m) => [m.skill, m.evidence.map(norm)]));
    const missingIds = new Set(fact.missing);

    if (exp.summary.length > MAX_SUMMARY) errors.push(`${fact.pathId}: summary is longer than ${MAX_SUMMARY} characters`);
    if (exp.strengths.length > MAX_STRENGTHS) errors.push(`${fact.pathId}: more than ${MAX_STRENGTHS} strengths`);
    if (exp.gaps.length > MAX_GAPS) errors.push(`${fact.pathId}: more than ${MAX_GAPS} gaps`);

    for (const s of exp.strengths) {
      if (!allowedEvidence.has(s.skill)) errors.push(`${fact.pathId}: strength "${s.skill}" is not in the matched list`);
      else if (!allowedEvidence.get(s.skill).includes(norm(s.evidence))) errors.push(`${fact.pathId}: evidence for "${s.skill}" is not copied exactly from the evidence list`);
    }
    for (const g of exp.gaps) if (!missingIds.has(g)) errors.push(`${fact.pathId}: gap "${g}" is not in the missing list`);

    const pathSkillIds = new Set(getPath(fact.pathId).skills.map((s) => s.id));
    for (const mentioned of detectSkills(exp.summary)) {
      if (!allowedEvidence.has(mentioned) && !pathSkillIds.has(mentioned)) {
        errors.push(`${fact.pathId}: summary mentions ${SKILLS[mentioned].label}, which has no evidence and is not part of this path`);
      }
    }
  }
  return errors;
}

/** Plain-code explanation used when the model cannot produce a clean answer. */
export function fallbackExplanations(facts) {
  return {
    paths: facts.map((f) => ({
      pathId: f.pathId,
      summary: `You already show ${f.matched.length} of the skills this path asks for.`,
      strengths: f.matched.filter((m) => m.evidence.length).slice(0, MAX_STRENGTHS).map((m) => ({ skill: m.skill, evidence: m.evidence[0] })),
      gaps: f.missing.slice(0, MAX_GAPS),
    })),
  };
}

/** Adds display labels so the UI never needs the catalog. */
export function withLabels(explanations) {
  return explanations.paths.map((p) => ({
    ...p,
    strengths: p.strengths.map((s) => ({ ...s, label: skillLabel(s.skill) })),
    gaps: p.gaps.map((g) => ({ id: g, label: skillLabel(g) })),
  }));
}
