import { openDb } from '../../src/db/index.js';
import { createApp } from '../../src/app.js';

/** Same as the unit-test server, but with the real model and GitHub client passed in. */
export async function startTestServerWith({ llm, github }) {
  const db = openDb(':memory:');
  const app = createApp({ db, github, llm, corsOrigin: '*' });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  return { call, base, close: () => new Promise((r) => server.close(() => { db.close(); r(); })) };
}
