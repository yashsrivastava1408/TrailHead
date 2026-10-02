import { loadConfig } from './config/index.js';
import { openDb } from './db/index.js';
import { createGithubClient } from './services/github.js';
import { createLlm } from './llm/client.js';
import { createApp } from './app.js';

const config = loadConfig();
const db = openDb(config.dbPath);
const llm = createLlm(config.llm);
const github = createGithubClient({ token: config.githubToken });

const app = createApp({ db, github, llm, corsOrigin: config.corsOrigin });
const server = app.listen(config.port, () => {
  console.log(`Trailhead API on http://localhost:${config.port}`);
  console.log(`LLM: ${llm.provider} / ${llm.model}${llm.isConfigured ? '' : '  (NOT CONFIGURED - set the key in server/.env)'}`);
});

llm.checkModel().then((ok) => {
  if (ok === false) {
    console.warn(`WARNING: model "${llm.model}" is not available to this API key.`);
    console.warn(`Set LLM_MODEL in server/.env to one of: ${llm.availableModels.join(', ')}`);
  }
});

const shutdown = () => server.close(() => { db.close(); process.exit(0); });
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
