import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { PATHS } from '../services/catalog.js';

const GITHUB_USERNAME = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

const createBody = z.object({
  githubUsername: z.string().trim().regex(GITHUB_USERNAME, 'Enter a valid GitHub username'),
  resumeText: z.string().max(20_000).default(''),
  freeHours: z.number().int().min(1).max(12).default(2),
  dislikesDsa: z.boolean().default(true),
});
const trialBody = z.object({
  pathId: z.string().min(1),
  answer: z.string().trim().min(20, 'Write a little more (at least 20 characters)').max(8_000),
  enjoyment: z.number().int().min(1).max(5),
});
const decideBody = z.object({ pathId: z.string().optional() });
const doneBody = z.object({ done: z.boolean() });

/** Wraps an async handler so thrown errors reach the error middleware. */
const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).then((data) => res.json(data), next);

export function createApiRouter({ sessions, llm }) {
  const router = Router();
  // The analysis and grading calls cost real time and money, so cap them per client.
  const expensive = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({ error: { code: 'rate_limited', message: 'Too many requests. Wait a minute and try again.' } }),
  });

  router.get('/health', (_req, res) => res.json({ ok: true }));

  router.get('/config', (_req, res) =>
    res.json({ llm: { provider: llm.provider, model: llm.model, configured: llm.isConfigured, modelAvailable: llm.modelAvailable } }),
  );

  router.get('/paths', (_req, res) => res.json(PATHS.map(({ id, name, summary, dsaLevel }) => ({ id, name, summary, dsaLevel }))));

  router.post('/sessions', expensive, handle(async (req, res) => {
    res.status(201);
    return sessions.create(createBody.parse(req.body));
  }));

  router.get('/sessions/:id', handle(async (req) => sessions.view(req.params.id)));

  router.get('/sessions/:id/tasks/:pathId', handle(async (req) => sessions.taskFor(req.params.id, req.params.pathId)));

  router.post('/sessions/:id/trials', expensive, handle(async (req) =>
    sessions.submitTrial(req.params.id, trialBody.parse(req.body))));

  router.get('/sessions/:id/decision', handle(async (req) => sessions.previewDecision(req.params.id)));

  router.post('/sessions/:id/decision', handle(async (req) =>
    sessions.decide(req.params.id, decideBody.parse(req.body ?? {}))));

  router.post('/sessions/:id/plan', expensive, handle(async (req, res) => {
    res.status(201);
    return sessions.createPlan(req.params.id);
  }));

  router.patch('/sessions/:id/plan/days/:seq', handle(async (req) => {
    const seq = z.coerce.number().int().min(1).parse(req.params.seq);
    return sessions.setDayDone(req.params.id, seq, doneBody.parse(req.body).done);
  }));

  router.post('/sessions/:id/plan/replan', handle(async (req) => sessions.replan(req.params.id)));

  return router;
}
