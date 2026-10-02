import { openDb } from '../src/db/index.js';
import { createApp } from '../src/app.js';

export const sampleEvidence = (login = 'ada') => ({
  user: { login, name: 'Ada', publicRepos: 3 },
  repos: [
    {
      name: 'shop-ui', description: 'Storefront', topics: ['react'], language: 'JavaScript',
      languages: { JavaScript: 9000, CSS: 1000 }, homepage: 'https://shop.vercel.app', stars: 3,
      pushedAt: '2026-09-01T00:00:00Z', rootFiles: ['package.json', 'README.md', 'tests'], hasWorkflows: false,
    },
    {
      name: 'api-server', description: 'REST API with express and mongodb', topics: [], language: 'JavaScript',
      languages: { JavaScript: 5000 }, homepage: null, stars: 0,
      pushedAt: '2026-08-01T00:00:00Z', rootFiles: ['package.json', 'Dockerfile'], hasWorkflows: true,
    },
    {
      name: 'ml-notes', description: '', topics: [], language: 'Jupyter Notebook',
      languages: { 'Jupyter Notebook': 8000, Python: 2000 }, homepage: null, stars: 0,
      pushedAt: '2026-07-01T00:00:00Z', rootFiles: ['notes.ipynb'], hasWorkflows: false,
    },
  ],
});

export const fakeGithub = (evidence = sampleEvidence()) => ({
  fetchEvidence: async (username) => {
    if (username === 'ghost-user') {
      const { AppError } = await import('../src/errors.js');
      throw new AppError(404, 'GitHub user not found', 'github_not_found');
    }
    return evidence;
  },
});

/** A fake model. `script` receives the prompt kind and returns the object to "reply" with. */
export function fakeLlm(script, overrides = {}) {
  const calls = [];
  return {
    provider: 'fake',
    model: 'fake-1',
    isConfigured: true,
    modelAvailable: null,
    calls,
    async completeJson({ system, user, schema }) {
      const kind = system.includes('career guide') ? 'explain' : system.includes('grade') ? 'grade' : 'plan';
      calls.push({ kind, user });
      const value = await script(kind, { user, calls: calls.filter((c) => c.kind === kind).length });
      return schema.parse(value);
    },
    ...overrides,
  };
}

/** Builds a clean explanation from the "Facts" JSON inside the prompt. */
export function cleanFromFacts(user) {
  const start = user.indexOf('Facts:\n') + 'Facts:\n'.length;
  const end = user.indexOf('\n\nYour previous answer');
  const facts = JSON.parse(end === -1 ? user.slice(start) : user.slice(start, end));
  return {
    paths: facts.map((f) => ({
      pathId: f.pathId,
      summary: 'A reasonable fit based on your projects.',
      strengths: f.matched.filter((m) => m.evidence.length).slice(0, 2).map((m) => ({ skill: m.skill, evidence: m.evidence[0] })),
      gaps: f.missing.slice(0, 2),
    })),
  };
}

export async function startTestServer({ llm, github = fakeGithub() } = {}) {
  const db = openDb(':memory:');
  const app = createApp({ db, github, llm, corsOrigin: '*' });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  return { call, db, base, close: () => new Promise((r) => server.close(() => { db.close(); r(); })) };
}
