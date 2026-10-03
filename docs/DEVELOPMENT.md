# Development guide

## Setup

```bash
npm install
cp server/.env.example server/.env   # add GROQ_API_KEY
npm run dev                          # server :4000, client :5173 (proxied /api)
npm test                             # server tests
npm run build                        # production client build -> client/dist
```

Node 22.13+ is required for the built-in `node:sqlite` (it prints an "experimental" warning, which is expected).

## Where things are

| I want to… | Change this |
|---|---|
| Add or edit a career path | `server/src/data/paths.json` (skills with weights, DSA level) |
| Add a skill the profile can detect | `server/src/data/skills.json` (id, label, aliases) |
| Add or edit a taste-test task | `server/src/data/tasks.json` (one task per path, each with 3 `questions`: `brief`, `options`, `correctOptionIndex`, `explanation`) |
| Change how paths are scored | `server/src/services/scoring.js` |
| Change decision weights | `WEIGHTS` in `server/src/services/decision.js` |
| Change the checker rules | `validateExplanations` in `server/src/services/explain.js` |
| Change prompts | `explain.js`, `trials.js`, `plan.js` (each prompt lives beside its schema) |
| Swap the model | `LLM_PROVIDER`, `LLM_MODEL`, `LLM_BASE_URL` in `server/.env` |
| Replace SQLite | `server/src/db/repo.js` is the only file with SQL |

### Add a path (example)
1. Add an entry to `paths.json`, using skill ids that exist in `skills.json`.
2. Add a task for it in `tasks.json` with the same `pathId` and 3 questions, each with 3-5 options, a `correctOptionIndex` and an `explanation`. The tests check this, and that every skill is used by some path.
3. Run `npm test`. The tests check that every path scores sensibly.

### Use a different model
```bash
# fully local (needs Ollama running and the model pulled)
LLM_PROVIDER=ollama
LLM_MODEL=llama3.1:8b

# any OpenAI-compatible host
LLM_PROVIDER=openai
LLM_BASE_URL=https://your-host/v1
LLM_API_KEY=...
LLM_MODEL=...
```
Small models follow the "copy evidence exactly" rule less reliably. The checker will catch mistakes, and after 3 failed tries the analysis falls back to code-written text. `meta.attempts` and `meta.usedFallback` show how often that happens, which is a handy way to compare models.

## Testing approach

- Unit tests for pure logic (profile, scoring, checker, decision, replan).
- Graph tests with a scripted fake model: happy path, retry after an invented claim, fallback after repeated failures, model-down degradation.
- HTTP tests start the real Express app on a random port with an in-memory SQLite database, a fake GitHub client and a fake model, and walk the whole journey.

## Verification status

| Area | Status |
|---|---|
| Server logic and API | **Verified:** 64 automated tests (fake GitHub + fake model) |
| Client components, pages and routing | **Verified:** 73 automated tests |
| Real model + real GitHub | **Verified:** the live suite passes (7/7) with `openai/gpt-oss-120b` on Groq: every claim backed by evidence, real 30-day plans that stay in the student's stack |
| Real browser, whole journey | **Verified:** a scripted Chrome session clicked through landing, evidence, analysis, taste test, decision, plan and overview against the real backend and model: no console errors, progress survives a reload, later steps stay locked until earlier ones are done |
| Layout | Screenshots checked at 1440px and 390px (mobile) |
| Llama 3.3 70B specifically | **Not verified:** that model is not enabled on the Groq account used for testing. Everything above ran on `gpt-oss-120b`. Switch with `LLM_MODEL` and run `npm run test:live -w server` |
| Local models (Ollama) | **Not verified:** the code path exists and is covered by config tests, but no local model was run |
| Other browsers / real phones | **Not verified** (Chrome only; mobile checked by screen-size emulation) |

### Bugs the testing found (and fixed)
- Rate-limit and oversized-body responses weren't in the JSON error format (plain text / HTTP 500).
- The decision page saved the choice just by previewing it (now a read-only `GET /decision`).
- A model without access was silently "falling back"; now reported at startup and in the sidebar.
- "I would rather avoid DSA" in a resume counted as DSA experience (now negation-aware).
- Plans could switch the student to a language they don't use (the prompt now carries their stack).
- Free-tier token limits (8,000/min on Groq): the client now waits once on a short `Retry-After`.

## Known limits and next steps

- Skill detection is keyword- and file-based. A repo's README text isn't read yet.
- Each taste test is three multiple-choice questions, so it is a quick signal and not a skills exam. A larger question bank, with a random three per attempt, would make it harder to memorise.
- One task per path. Adding a second and rotating them would reduce repeat answers.
- No authentication: the session id in the browser is the only key.
- Planned: Postgres adapter, a job queue for slow model calls, saving real job-post data per path.

## Scaling checklist (when it is no longer one person's tool)

1. Add authentication and tie sessions to users.
2. Move the database to Postgres (replace `db/repo.js`).
3. Move the GitHub cache to Redis and use a token pool.
4. Run analysis and plan generation as queued jobs, and show progress in the UI.
5. Put `client/dist` on a CDN and run the API behind a load balancer.
