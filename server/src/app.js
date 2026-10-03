import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRepo } from './db/repo.js';
import { createAnalyzeGraph } from './graph/analyze.js';
import { createSessionService } from './services/sessions.js';
import { createApiRouter } from './routes/api.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';

const CLIENT_DIST = fileURLToPath(new URL('../../client/dist', import.meta.url));

/**
 * Builds the Express app from its dependencies (database, GitHub client, LLM).
 * Passing them in keeps the app testable: tests inject fakes, production injects the real ones.
 */
export function createApp({ db, github, llm, corsOrigin }) {
  const repo = createRepo(db);
  const analyzeGraph = createAnalyzeGraph({ github, llm });
  const sessions = createSessionService({ repo, analyzeGraph, llm });

  const app = express();
  app.disable('x-powered-by');
  // On Render (and most hosts) the app sits behind one proxy. Trust it, so the per-visitor
  // rate limit sees each visitor's real address instead of the proxy's.
  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        // GitHub profile pictures (github.com/<user>.png redirects to avatars.githubusercontent.com)
        'img-src': ["'self'", 'data:', 'https://github.com', 'https://avatars.githubusercontent.com'],
      },
    },
  }));
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', createApiRouter({ sessions, llm }));
  app.use('/api', notFoundHandler);

  // In production one process serves the built React app too.
  if (existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(`${CLIENT_DIST}/index.html`));
  }

  app.use(errorHandler);
  return app;
}
