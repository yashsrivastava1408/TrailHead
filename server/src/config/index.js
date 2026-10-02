import { z } from 'zod';

const PROVIDERS = {
  groq: {
    baseURL: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    keyEnv: 'GROQ_API_KEY',
  },
  ollama: {
    baseURL: 'http://localhost:11434/v1',
    model: 'llama3.1:8b',
    keyEnv: null,
  },
  openai: {
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    keyEnv: 'OPENAI_API_KEY',
  },
};

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DB_PATH: z.string().default('./data/trailhead.db'),
  GITHUB_TOKEN: z.string().optional(),
  LLM_PROVIDER: z.enum(['groq', 'ollama', 'openai']).default('groq'),
  LLM_MODEL: z.string().optional(),
  LLM_BASE_URL: z.string().url().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
});

/**
 * Reads and validates environment variables once, so the rest of the code
 * never touches process.env directly.
 */
export function loadConfig(env = process.env) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  const e = parsed.data;
  const preset = PROVIDERS[e.LLM_PROVIDER];
  return {
    port: e.PORT,
    corsOrigin: e.CORS_ORIGIN,
    dbPath: e.DB_PATH,
    githubToken: e.GITHUB_TOKEN || null,
    llm: {
      provider: e.LLM_PROVIDER,
      model: e.LLM_MODEL || preset.model,
      baseURL: e.LLM_BASE_URL || preset.baseURL,
      apiKey: e.LLM_API_KEY || (preset.keyEnv ? env[preset.keyEnv] : 'ollama') || null,
      timeoutMs: e.LLM_TIMEOUT_MS,
    },
  };
}
