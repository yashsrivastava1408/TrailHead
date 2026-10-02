import { describe, expect, it, vi } from 'vitest';
import { api } from '../src/lib/api.js';

const reply = (status, body) => vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });

describe('api client', () => {
  it('GET sends no body and no content-type header, and returns the JSON', async () => {
    const fetch = reply(200, { id: 's1' });
    vi.stubGlobal('fetch', fetch);
    expect(await api.getSession('s1')).toEqual({ id: 's1' });
    expect(fetch).toHaveBeenCalledWith('/api/sessions/s1', { method: 'GET', headers: undefined, body: undefined });
  });

  it('POST sends JSON with the right header', async () => {
    const fetch = reply(201, { id: 'x' });
    vi.stubGlobal('fetch', fetch);
    await api.createSession({ githubUsername: 'ada', freeHours: 2 });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/sessions');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ githubUsername: 'ada', freeHours: 2 });
  });

  it("throws the server's friendly message and keeps the status", async () => {
    vi.stubGlobal('fetch', reply(404, { error: { code: 'github_not_found', message: 'GitHub user not found' } }));
    await expect(api.createSession({})).rejects.toMatchObject({ message: 'GitHub user not found', status: 404 });
  });

  it('falls back to a generic message when the error has no body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error('no json'); } }));
    await expect(api.config()).rejects.toThrow('Request failed (500)');
  });

  it('explains a network failure in plain words', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api.config()).rejects.toThrow('Cannot reach the server. Is it running?');
  });

  it('builds the right URLs and verbs for each action', async () => {
    const fetch = reply(200, {});
    vi.stubGlobal('fetch', fetch);
    await api.getTask('s1', 'qa-sdet');
    await api.previewDecision('s1');
    await api.decide('s1');
    await api.decide('s1', 'qa-sdet');
    await api.createPlan('s1');
    await api.setDayDone('s1', 4, true);
    await api.replan('s1');
    const calls = fetch.mock.calls.map(([url, init]) => `${init.method} ${url}${init.body ? ' ' + init.body : ''}`);
    expect(calls).toEqual([
      'GET /api/sessions/s1/tasks/qa-sdet',
      'GET /api/sessions/s1/decision',
      'POST /api/sessions/s1/decision {}',
      'POST /api/sessions/s1/decision {"pathId":"qa-sdet"}',
      'POST /api/sessions/s1/plan',
      'PATCH /api/sessions/s1/plan/days/4 {"done":true}',
      'POST /api/sessions/s1/plan/replan',
    ]);
  });
});
