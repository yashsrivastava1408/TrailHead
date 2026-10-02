import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, createLlm } from '../src/llm/client.js';
import { loadConfig } from '../src/config/index.js';
import { z } from 'zod';

test('extractJson handles fences, chatter and plain JSON', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('Sure!\n```json\n{"a":2}\n```'), { a: 2 });
  assert.deepEqual(extractJson('Here you go: {"a":{"b":3}} hope it helps'), { a: { b: 3 } });
  assert.throws(() => extractJson('no json here'));
});

test('config picks sensible defaults per provider', () => {
  const groq = loadConfig({ GROQ_API_KEY: 'k' });
  assert.equal(groq.llm.provider, 'groq');
  assert.equal(groq.llm.model, 'llama-3.3-70b-versatile');
  assert.equal(groq.llm.apiKey, 'k');
  const ollama = loadConfig({ LLM_PROVIDER: 'ollama' });
  assert.match(ollama.llm.baseURL, /11434/);
  assert.throws(() => loadConfig({ LLM_PROVIDER: 'nope' }), /Invalid environment/);
});

test('a remote provider without a key fails fast with a clear error', async () => {
  const llm = createLlm(loadConfig({ LLM_PROVIDER: 'groq' }).llm);
  assert.equal(llm.isConfigured, false);
  await assert.rejects(llm.completeJson({ system: 's', user: 'u', schema: z.object({}) }), /not configured/);
});
