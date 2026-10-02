import { ChatOpenAI } from '@langchain/openai';
import { AppError } from '../errors.js';

/**
 * Pulls the first JSON object out of a model reply.
 * Models often wrap JSON in ```json fences or add a sentence before it.
 */
export function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object found in the reply');
  return JSON.parse(candidate.slice(start, end + 1));
}

const contentToText = (content) =>
  typeof content === 'string' ? content : content.map((part) => part.text ?? '').join('');

// A rate-limited call is retried once if the provider says it will be free within this long.
const MAX_RATE_LIMIT_WAIT_S = 20;

/** Seconds the provider asked us to wait (Retry-After header), or null. Handles Headers objects and plain objects. */
export function retryAfterSeconds(err) {
  const h = err.headers ?? err.response?.headers;
  const raw = typeof h?.get === 'function' ? h.get('retry-after') : h?.['retry-after'];
  const seconds = Number.parseFloat(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Turns a provider error into an AppError the client can understand. */
function toAppError(err) {
  const status = err.status ?? err.response?.status;
  if (status === 429) return new AppError(429, 'The model is rate limited right now. Wait a minute and try again.', 'llm_rate_limited');
  if (status === 401 || status === 403) return new AppError(502, 'The model provider rejected the API key.', 'llm_auth');
  if (status === 404) return new AppError(502, `The model is not available to this API key: ${err.message.split('\n')[0]}`, 'llm_model_unavailable');
  return new AppError(502, `LLM request failed: ${err.message.split('\n')[0]}`, 'llm_error');
}

/**
 * The only LLM interface the rest of the app uses:
 *   llm.completeJson({ system, user, schema }) -> parsed, validated object
 *
 * It works with any OpenAI-compatible endpoint (Groq, Ollama, vLLM, ...), so the
 * model is swapped by changing environment variables, not code. If the reply is
 * not valid JSON for the schema, the error is fed back to the model for another try.
 *
 * `chatModel` can be injected (tests do this); otherwise one is built from config.
 */
export function createLlm(config, { maxAttempts = 3, chatModel, fetchImpl = fetch, sleep = sleepMs } = {}) {
  const needsKey = config.provider !== 'ollama';
  const model =
    chatModel ??
    new ChatOpenAI({
      model: config.model,
      apiKey: config.apiKey || 'missing',
      temperature: 0.2,
      timeout: config.timeoutMs,
      maxRetries: 1,
      configuration: { baseURL: config.baseURL },
    });

  const llm = {
    provider: config.provider,
    model: config.model,
    isConfigured: !needsKey || Boolean(config.apiKey),
    /** null = not checked yet / could not check, true/false = answer from the provider */
    modelAvailable: null,
    availableModels: [],

    /**
     * Asks the provider which models this key may use, so a wrong model name is
     * reported at startup instead of failing on the first real request.
     */
    async checkModel() {
      if (!llm.isConfigured) return llm.modelAvailable;
      try {
        const res = await fetchImpl(`${config.baseURL}/models`, { headers: { Authorization: `Bearer ${config.apiKey}` } });
        if (!res.ok) return llm.modelAvailable;
        const { data } = await res.json();
        llm.availableModels = data.map((m) => m.id).sort();
        llm.modelAvailable = llm.availableModels.includes(config.model);
      } catch {
        // offline or unsupported endpoint: stay "unknown"
      }
      return llm.modelAvailable;
    },

    async completeJson({ system, user, schema }) {
      if (needsKey && !config.apiKey) {
        throw new AppError(503, `LLM is not configured. Set the API key for "${config.provider}" in server/.env`, 'llm_unconfigured');
      }
      const messages = [
        ['system', `${system}\n\nReply with ONE JSON object only. No markdown, no commentary.`],
        ['human', user],
      ];
      let lastError = 'unknown';
      let waitedForRateLimit = false;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let reply;
        try {
          reply = await model.invoke(messages);
        } catch (err) {
          const wait = (err.status ?? err.response?.status) === 429 ? retryAfterSeconds(err) : null;
          if (wait !== null && wait <= MAX_RATE_LIMIT_WAIT_S && !waitedForRateLimit) {
            waitedForRateLimit = true; // one patient retry; a second 429 is reported to the user
            await sleep(Math.ceil(wait * 1000) + 250);
            attempt -= 1; // waiting does not use up a "bad reply" attempt
            continue;
          }
          throw toAppError(err);
        }
        const text = contentToText(reply.content);
        try {
          return schema.parse(extractJson(text));
        } catch (err) {
          lastError = err.issues ? JSON.stringify(err.issues.slice(0, 5)) : err.message;
          messages.push(['ai', text]);
          messages.push(['human', `That reply was invalid: ${lastError}. Fix it and reply with the corrected JSON only.`]);
        }
      }
      throw new AppError(502, `LLM returned invalid JSON after ${maxAttempts} attempts: ${lastError}`, 'llm_invalid');
    },
  };
  return llm;
}
