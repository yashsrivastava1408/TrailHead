# API reference

Base URL: `/api`. All bodies are JSON. Errors always look like:

```json
{ "error": { "code": "validation_error", "message": "Enter a valid GitHub username" } }
```

| Status | Meaning |
|---|---|
| 400 | Invalid input or a rule was broken (e.g. choosing a path you haven't tried) |
| 404 | Unknown session, path, plan day or GitHub user |
| 409 | Step out of order (decide with no trial, plan with no chosen path) |
| 429 | Rate limited (our limit or GitHub's) |
| 502 / 503 | Model failed / not configured |

Rate limit: 20 requests per minute per IP on the endpoints marked ⏱.

## Meta

| Method | Path | Returns |
|---|---|---|
| GET | `/health` | `{ ok: true }` |
| GET | `/config` | `{ llm: { provider, model, configured } }` |
| GET | `/paths` | Catalog: `[{ id, name, summary, dsaLevel }]` |

## Sessions

### `POST /sessions` ⏱
Reads GitHub, builds the profile, scores paths, writes explanations. Takes a few seconds, longer with a slow model.

```json
{ "githubUsername": "octocat", "resumeText": "optional", "freeHours": 2, "dislikesDsa": true }
```

`freeHours`: 1-12. Returns `201` with the session view:

```json
{
  "id": "uuid",
  "githubUsername": "octocat",
  "status": "analyzed",
  "profile": { "skills": [{ "id": "react", "label": "React", "evidence": ["shop-ui: topic \"react\""] }], "signals": {}, "lowEvidence": false },
  "analysis": {
    "ranking": [{ "pathId": "fullstack", "name": "...", "fit": 72, "rankScore": 72, "matched": [], "missing": [], "dsaLevel": "medium" }],
    "explanations": [{ "pathId": "fullstack", "summary": "...", "strengths": [{ "skill": "react", "label": "React", "evidence": "..." }], "gaps": [{ "id": "testing", "label": "Testing" }] }],
    "meta": { "attempts": 1, "usedFallback": false, "llmError": null, "model": "...", "provider": "..." }
  },
  "trials": [], "decision": null, "chosenPath": null, "plan": null
}
```

The resume is stored but never returned.

### `GET /sessions/:id`
The same view, current state.

## Taste test

### `GET /sessions/:id/tasks/:pathId`
The task for one of the student's **top 3** paths: `{ pathId, title, minutes, questions: [{ brief, starter, options }] }` (3 questions). The answer key (`correctOptionIndex`) and the explanations are **not** sent. `400` for other paths, `404` for unknown ones.

### `POST /sessions/:id/trials` ⏱
```json
{ "pathId": "fullstack", "answers": ["2", "0", "3"], "enjoyment": 4 }
```
`answers` has one option index (as a string) per question, in order; the wrong number of answers, a non-number, or an index that doesn't exist is a `400`. `enjoyment`: 1-5. Grading is done in code: the score is the share of questions answered correctly (0, 33, 67 or 100). It needs no model and is never rate limited. Retrying the same path replaces the earlier trial. Returns the session view; each trial has `{ pathId, score, enjoyment, feedback: { feedback, right, total, review: [{ question, chosen, correctOption, isCorrect, explanation }] } }`. The review (with the right answers and explanations) is only returned after answering; the raw answers are not returned.

## Decision

### `GET /sessions/:id/decision`
A read-only preview. Saves nothing.

```json
{
  "weights": { "fit": 0.4, "performance": 0.35, "enjoyment": 0.25 },
  "options": [{ "pathId": "qa-sdet", "name": "QA / SDET", "combined": 77, "fit": 50, "performance": 90, "enjoyment": 100 }],
  "recommended": "qa-sdet",
  "reason": "…",
  "chosenPath": null
}
```
`409` if no trial exists yet.

### `POST /sessions/:id/decision`
`{}` accepts the recommendation, or `{ "pathId": "…" }` overrides it. The path must have been tried (`400` otherwise).

## Plan

### `POST /sessions/:id/plan` ⏱
Needs a chosen path (`409` otherwise). Returns `201` with the view plus `planSource` (`"llm"` or `"fallback"`) and `planNote` (the reason, if fallback). The plan is 30 tasks, each capped to the student's daily minutes.

```json
"plan": {
  "days": [{ "seq": 1, "day": 1, "title": "…", "task": "…", "minutes": 90, "skill": "React", "done": false }],
  "progress": { "done": 0, "total": 30 },
  "today": 1
}
```

### `PATCH /sessions/:id/plan/days/:seq`
`{ "done": true }`. `404` for an unknown day.

### `POST /sessions/:id/plan/replan`
Keeps finished tasks where they are and puts unfinished tasks on consecutive days starting today, in their original order. `409` if there is no plan.
