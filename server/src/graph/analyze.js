import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { buildProfile } from '../services/profile.js';
import { scorePaths } from '../services/scoring.js';
import {
  buildAllowedFacts,
  buildExplainPrompt,
  explanationSchema,
  fallbackExplanations,
  validateExplanations,
  withLabels,
} from '../services/explain.js';

const State = Annotation.Root({
  username: Annotation(),
  resumeText: Annotation(),
  dislikesDsa: Annotation(),
  evidence: Annotation(),
  profile: Annotation(),
  ranking: Annotation(),
  facts: Annotation(),
  explanations: Annotation(),
  errors: Annotation(),
  attempts: Annotation(),
  usedFallback: Annotation(),
  llmError: Annotation(),
});

/**
 * The analysis pipeline as a LangGraph state machine:
 *
 *   fetchEvidence -> buildProfile -> score -> explain -> check --ok--> END
 *                                               ^          |
 *                                               +--retry---+   (up to maxAttempts)
 *                                                          |
 *                                                          +--give up--> fallback -> END
 *
 * Counting and scoring are plain code. The model only writes the explanation,
 * and `check` rejects anything the profile cannot prove.
 */
export function createAnalyzeGraph({ github, llm, maxAttempts = 3 }) {
  const graph = new StateGraph(State)
    .addNode('fetchEvidence', async (s) => ({ evidence: await github.fetchEvidence(s.username) }))
    .addNode('buildProfile', (s) => ({ profile: buildProfile({ evidence: s.evidence, resumeText: s.resumeText }) }))
    .addNode('score', (s) => {
      const ranking = scorePaths(s.profile, { dislikesDsa: s.dislikesDsa });
      return { ranking, facts: buildAllowedFacts(s.profile, ranking), attempts: 0, errors: [] };
    })
    .addNode('explain', async (s) => {
      const { system, user } = buildExplainPrompt(s.facts, s.errors);
      try {
        const explanations = await llm.completeJson({ system, user, schema: explanationSchema });
        return { explanations, attempts: s.attempts + 1 };
      } catch (err) {
        // Model down or unconfigured: still return the code-only analysis, and say so.
        return { explanations: fallbackExplanations(s.facts), usedFallback: true, llmError: err.message };
      }
    })
    .addNode('check', (s) => ({ errors: s.llmError ? [] : validateExplanations(s.explanations, s.facts) }))
    .addNode('fallback', (s) => ({ explanations: fallbackExplanations(s.facts), usedFallback: true }))
    .addEdge(START, 'fetchEvidence')
    .addEdge('fetchEvidence', 'buildProfile')
    .addEdge('buildProfile', 'score')
    .addEdge('score', 'explain')
    .addEdge('explain', 'check')
    .addConditionalEdges(
      'check',
      (s) => {
        if (s.llmError || s.errors.length === 0) return 'done';
        return s.attempts < maxAttempts ? 'retry' : 'giveUp';
      },
      { done: END, retry: 'explain', giveUp: 'fallback' },
    )
    .addEdge('fallback', END)
    .compile();

  return {
    async run({ username, resumeText = '', dislikesDsa = false }) {
      const out = await graph.invoke({ username, resumeText, dislikesDsa, usedFallback: false });
      return {
        profile: out.profile,
        analysis: {
          ranking: out.ranking,
          explanations: withLabels(out.explanations),
          meta: {
            attempts: out.attempts,
            usedFallback: out.usedFallback,
            llmError: out.llmError ?? null,
            model: llm.model,
            provider: llm.provider,
          },
        },
      };
    },
  };
}
