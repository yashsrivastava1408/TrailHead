import { z } from 'zod';
import { skillLabel } from './catalog.js';

export const PLAN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const dayShape = z.object({
  title: z.string().min(3).max(80),
  task: z.string().min(10).max(400),
  minutes: z.number().int().min(10).max(720),
  skill: z.string().max(40).default(''),
});

export const planSchema = z.object({ days: z.array(dayShape).length(PLAN_DAYS) });

/** Asks the model for a 30-day plan. Throws if the reply does not fit the schema. */
export async function generatePlan({ llm, path, strengths, knownSkills = [], missing, freeHours }) {
  const system = [
    'You are a practical mentor building a 30-day plan for a final-year student who wants a job in the given path.',
    `Return exactly ${PLAN_DAYS} days in order. Each day is ONE concrete, doable task (build, write, fix or read-then-build), never vague advice.`,
    'Start with the missing skills that matter most, then combine them in a small portfolio project, then interview preparation.',
    'Build on the student\'s own stack (knownSkills): use the languages and tools they already know for examples and projects. Do not switch them to a language or framework they have not used unless a missing skill requires it.',
    `Each day's "minutes" must not exceed the student's daily time. Use the skill label in "skill" or an empty string.`,
    'JSON shape: {"days":[{"title":"","task":"","minutes":0,"skill":""}]}',
  ].join('\n');
  const user = JSON.stringify({
    path: path.name,
    summary: path.summary,
    alreadyStrongAt: strengths,
    knownSkills,
    missingSkills: missing,
    dailyMinutes: freeHours * 60,
  });

  const plan = await llm.completeJson({ system, user, schema: planSchema });
  const cap = freeHours * 60;
  return plan.days.map((d) => ({ ...d, minutes: Math.min(d.minutes, cap) }));
}

/** Plain-code plan, used when the model cannot produce a valid one. */
export function fallbackPlan({ path, missing, freeHours }) {
  const minutes = Math.min(freeHours * 60, 120);
  const skills = missing.length ? missing : path.skills.map((s) => skillLabel(s.id));
  const days = [];

  // Days 1-18: three days per missing skill (learn, practise, mini-build).
  for (let i = 0; days.length < 18; i += 1) {
    const skill = skills[i % skills.length];
    days.push(
      { title: `${skill}: learn the basics`, task: `Follow one good tutorial on ${skill} and write down 5 things you learned.`, minutes, skill },
      { title: `${skill}: practise`, task: `Solve 3 small exercises on ${skill} without looking at the tutorial.`, minutes, skill },
      { title: `${skill}: mini build`, task: `Build a tiny working example that uses ${skill} and push it to GitHub with a README.`, minutes, skill },
    );
  }
  days.length = 18;

  // Days 19-26: one portfolio project for this path.
  for (let d = 1; d <= 8; d += 1) {
    days.push({
      title: `${path.name}: portfolio project, part ${d}/8`,
      task: `Work on one portfolio project for ${path.name} that uses your new skills. Today: plan, build or polish part ${d} of 8 and commit your work.`,
      minutes,
      skill: '',
    });
  }

  // Days 27-30: interview preparation.
  days.push(
    { title: 'Write your project story', task: 'Write a one-page story of your portfolio project: problem, your choices, what you would improve.', minutes, skill: '' },
    { title: 'Mock interview questions', task: `Write answers to 10 common ${path.name} interview questions and say them aloud.`, minutes, skill: '' },
    { title: 'Update resume and GitHub', task: 'Update your resume with the new project and pin it on your GitHub profile.', minutes, skill: '' },
    { title: 'Apply to 5 roles', task: `Find 5 real ${path.name} openings, note the skills they ask for, and apply to at least 2.`, minutes, skill: '' },
  );

  return days.slice(0, PLAN_DAYS);
}

/** Which plan day "today" is, counting from the day the plan started (1-based). */
export function todayIndex(startedAt, now = Date.now()) {
  return Math.max(1, Math.floor((now - startedAt) / DAY_MS) + 1);
}

/**
 * Re-plans after missed days. Finished tasks keep their day. Unfinished tasks
 * are lined up one per day starting today, in their original order.
 * Returns [{ seq, day }] assignments.
 */
export function replan(days, today) {
  const pending = days.filter((d) => !d.done);
  return pending.map((d, i) => ({ seq: d.seq, day: today + i }));
}

export const planProgress = (days) => ({
  done: days.filter((d) => d.done).length,
  total: days.length,
});
