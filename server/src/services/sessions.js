import { badRequest, conflict, notFound } from '../errors.js';
import { getPath, getTask } from './catalog.js';
import { TOP_N } from './explain.js';
import { gradeTrial } from './trials.js';
import { computeDecision } from './decision.js';
import { fallbackPlan, generatePlan, planProgress, replan, todayIndex } from './plan.js';

/**
 * Application logic for one student's journey. Routes call this; this calls
 * the repo (database), the analysis graph and the LLM. No Express in here,
 * so it is easy to test.
 */
export function createSessionService({ repo, analyzeGraph, llm }) {
  const mustFind = (id) => {
    const session = repo.getSession(id);
    if (!session) throw notFound('Session');
    return session;
  };

  function view(id) {
    const session = mustFind(id);
    const days = repo.listDays(id);
    const { resumeText, ...rest } = session; // the resume is private: never sent back
    return {
      ...rest,
      trials: repo.listTrials(id).map(({ answer, ...t }) => t),
      plan: days.length
        ? { days, progress: planProgress(days), today: todayIndex(session.planStartedAt) }
        : null,
    };
  }

  /** The task for a path. Taste tests are offered for the student's top paths only. */
  function taskFor(id, pathId) {
    const session = mustFind(id);
    if (!getPath(pathId)) throw notFound('Path');
    const offered = session.analysis.ranking.slice(0, TOP_N).map((r) => r.pathId);
    if (!offered.includes(pathId)) throw badRequest('Taste tests are offered for your top paths only');
    // The answer key stays on the server until the student has answered.
    const task = getTask(pathId);
    return {
      pathId: task.pathId,
      title: task.title,
      minutes: task.minutes,
      questions: task.questions.map(({ brief, starter, options }) => ({ brief, starter, options })),
    };
  }

  return {
    view,

    async create({ githubUsername, resumeText, freeHours, dislikesDsa }) {
      const { profile, analysis } = await analyzeGraph.run({ username: githubUsername, resumeText, dislikesDsa });
      const id = repo.createSession({ githubUsername: profile.username, resumeText, freeHours, dislikesDsa, profile, analysis });
      return view(id);
    },

    taskFor,

    async submitTrial(id, { pathId, answers, enjoyment }) {
      taskFor(id, pathId); // validates the path is offered
      const graded = gradeTrial({ task: getTask(pathId), answers });
      repo.saveTrial({ sessionId: id, pathId, answer: JSON.stringify(answers), score: graded.score, enjoyment, feedback: graded });
      return view(id);
    },

    /** Computes the recommendation without saving anything. */
    previewDecision(id) {
      const session = mustFind(id);
      return {
        ...computeDecision({ ranking: session.analysis.ranking, trials: repo.listTrials(id) }),
        chosenPath: session.chosenPath,
      };
    },

    decide(id, { pathId } = {}) {
      const session = mustFind(id);
      const decision = computeDecision({ ranking: session.analysis.ranking, trials: repo.listTrials(id) });
      const chosen = pathId ?? decision.recommended;
      if (!decision.options.some((o) => o.pathId === chosen)) throw badRequest('You can only choose a path you have tried');
      repo.saveDecision(id, { ...decision, overridden: chosen !== decision.recommended }, chosen);
      return view(id);
    },

    async createPlan(id) {
      const session = mustFind(id);
      if (!session.chosenPath) throw conflict('Choose a path before creating a plan');

      const path = getPath(session.chosenPath);
      const row = session.analysis.ranking.find((r) => r.pathId === path.id);
      const input = {
        llm,
        path,
        strengths: row.matched.map((m) => m.label),
        knownSkills: session.profile.skills.map((s) => s.label),
        missing: row.missing.map((m) => m.label),
        freeHours: session.freeHours,
      };

      let days;
      let source = 'llm';
      let note = null;
      try {
        days = await generatePlan(input);
      } catch (err) {
        days = fallbackPlan(input);
        source = 'fallback';
        note = err.message;
      }
      repo.savePlan(id, days.map((d, i) => ({ ...d, day: i + 1 })));
      return { ...view(id), planSource: source, planNote: note };
    },

    setDayDone(id, seq, done) {
      mustFind(id);
      if (!repo.setDayDone(id, seq, done)) throw notFound('Plan day');
      return view(id);
    },

    /** Moves unfinished tasks forward, one per day, starting today. */
    replan(id) {
      const session = mustFind(id);
      const days = repo.listDays(id);
      if (!days.length) throw conflict('There is no plan to adjust yet');
      repo.reschedule(id, replan(days, todayIndex(session.planStartedAt)));
      return view(id);
    },
  };
}
