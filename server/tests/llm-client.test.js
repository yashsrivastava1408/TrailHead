import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createLlm, retryAfterSeconds } from '../src/llm/client.js';

const config = { provider: 'groq', model: 'm1', baseURL: 'http://x/v1', apiKey: 'k', timeoutMs: 1000 };
const schema = z.object({ n: z.number() });

/** A scripted stand-in for the chat model: each call returns/throws the next step. */
function scripted(...steps) {
  const seen = [];
  return {
    seen,
    async invoke(messages) {
      seen.push(messages.map((m) => [...m]));
      const step = steps[Math.min(seen.length - 1, steps.length - 1)];
      if (step instanceof Error) throw step;
      return { content: step };
    },
  };
}
const httpError = (status, message = 'boom') => Object.assign(new Error(message), { status });

test('returns the parsed object when the first reply is valid', async () => {
  const chatModel = scripted('{"n": 7}');
  const out = await createLlm(config, { chatModel }).completeJson({ system: 's', user: 'u', schema });
  assert.deepEqual(out, { n: 7 });
  assert.equal(chatModel.seen.length, 1);
  assert.match(chatModel.seen[0][0][1], /ONE JSON object only/);
});

test('accepts replies wrapped in fences or split into content parts', async () => {
  const fenced = scripted('Sure!\n```json\n{"n": 1}\n```');
  assert.deepEqual(await createLlm(config, { chatModel: fenced }).completeJson({ system: 's', user: 'u', schema }), { n: 1 });
  const parts = scripted([{ type: 'text', text: '{"n"' }, { type: 'text', text: ': 2}' }]);
  assert.deepEqual(await createLlm(config, { chatModel: parts }).completeJson({ system: 's', user: 'u', schema }), { n: 2 });
});

test('invalid JSON is retried and the error is fed back to the model', async () => {
  const chatModel = scripted('not json at all', '{"n": 3}');
  const out = await createLlm(config, { chatModel }).completeJson({ system: 's', user: 'u', schema });
  assert.deepEqual(out, { n: 3 });
  assert.equal(chatModel.seen.length, 2);
  const retry = chatModel.seen[1];
  assert.equal(retry.at(-2)[0], 'ai');
  assert.match(retry.at(-1)[1], /That reply was invalid/);
});

test('a schema mismatch is retried too', async () => {
  const chatModel = scripted('{"n": "seven"}', '{"n": 7}');
  assert.deepEqual(await createLlm(config, { chatModel }).completeJson({ system: 's', user: 'u', schema }), { n: 7 });
});

test('after maxAttempts bad replies it throws a 502', async () => {
  const chatModel = scripted('nope');
  await assert.rejects(
    createLlm(config, { chatModel, maxAttempts: 2 }).completeJson({ system: 's', user: 'u', schema }),
    (err) => err.status === 502 && err.code === 'llm_invalid' && chatModel.seen.length === 2,
  );
});

test('provider errors are mapped to clear app errors', async () => {
  const run = (status) =>
    createLlm(config, { chatModel: scripted(httpError(status)) }).completeJson({ system: 's', user: 'u', schema }).catch((e) => e);
  const limited = await run(429);
  assert.equal(limited.status, 429);
  assert.equal(limited.code, 'llm_rate_limited');
  assert.equal((await run(401)).code, 'llm_auth');
  assert.equal((await run(404)).code, 'llm_model_unavailable');
  const other = await run(500);
  assert.equal(other.status, 502);
  assert.doesNotMatch(other.message, /\n/, 'only the first line of the provider error is shown');
});

test('provider errors are not retried (retrying a 429 would only make it worse)', async () => {
  const chatModel = scripted(httpError(429));
  await createLlm(config, { chatModel }).completeJson({ system: 's', user: 'u', schema }).catch(() => {});
  assert.equal(chatModel.seen.length, 1);
});

test('checkModel reports whether the configured model is available', async () => {
  const listing = (ids) => async () => ({ ok: true, json: async () => ({ data: ids.map((id) => ({ id })) }) });
  const yes = createLlm(config, { chatModel: scripted(), fetchImpl: listing(['m1', 'm2']) });
  assert.equal(await yes.checkModel(), true);
  const no = createLlm(config, { chatModel: scripted(), fetchImpl: listing(['other-b', 'other-a']) });
  assert.equal(await no.checkModel(), false);
  assert.deepEqual(no.availableModels, ['other-a', 'other-b']);
});

test('checkModel stays "unknown" when it cannot find out', async () => {
  const down = createLlm(config, { chatModel: scripted(), fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(await down.checkModel(), null);
  const denied = createLlm(config, { chatModel: scripted(), fetchImpl: async () => ({ ok: false }) });
  assert.equal(await denied.checkModel(), null);
  const noKey = createLlm({ ...config, apiKey: null }, { chatModel: scripted(), fetchImpl: async () => { throw new Error('should not be called'); } });
  assert.equal(await noKey.checkModel(), null);
});

const limited = (retryAfter) => Object.assign(new Error('429 rate limit'), { status: 429, headers: retryAfter === undefined ? undefined : { 'retry-after': String(retryAfter) } });

test('a short rate limit is waited out once, then the call succeeds', async () => {
  const sleeps = [];
  const chatModel = scripted(limited(2), '{"n": 9}');
  const out = await createLlm(config, { chatModel, sleep: async (ms) => { sleeps.push(ms); } }).completeJson({ system: 's', user: 'u', schema });
  assert.deepEqual(out, { n: 9 });
  assert.equal(chatModel.seen.length, 2);
  assert.deepEqual(sleeps, [2250], 'waited retry-after plus a small margin');
});

test('waiting for a rate limit does not use up a bad-reply attempt', async () => {
  const chatModel = scripted('bad', limited(1), 'bad again', '{"n": 5}');
  const out = await createLlm(config, { chatModel, maxAttempts: 3, sleep: async () => {} }).completeJson({ system: 's', user: 'u', schema });
  assert.deepEqual(out, { n: 5 });
});

test('a second rate limit, a long wait, or no retry-after is reported instead of waited out', async () => {
  const sleeps = [];
  const sleep = async (ms) => { sleeps.push(ms); };
  const twice = await createLlm(config, { chatModel: scripted(limited(1)), sleep }).completeJson({ system: 's', user: 'u', schema }).catch((e) => e);
  assert.equal(twice.code, 'llm_rate_limited');
  assert.equal(sleeps.length, 1, 'only one wait');

  sleeps.length = 0;
  const long = await createLlm(config, { chatModel: scripted(limited(120)), sleep }).completeJson({ system: 's', user: 'u', schema }).catch((e) => e);
  assert.equal(long.code, 'llm_rate_limited');
  const none = await createLlm(config, { chatModel: scripted(limited(undefined)), sleep }).completeJson({ system: 's', user: 'u', schema }).catch((e) => e);
  assert.equal(none.code, 'llm_rate_limited');
  assert.equal(sleeps.length, 0);
});

test('retryAfterSeconds reads plain-object and Headers-style errors and ignores junk', () => {
  assert.equal(retryAfterSeconds({ headers: { 'retry-after': '7' } }), 7);
  assert.equal(retryAfterSeconds({ headers: new Headers({ 'retry-after': '3.5' }) }), 3.5);
  assert.equal(retryAfterSeconds({ response: { headers: { 'retry-after': '4' } } }), 4);
  assert.equal(retryAfterSeconds({ headers: { 'retry-after': 'soon' } }), null);
  assert.equal(retryAfterSeconds({}), null);
});
