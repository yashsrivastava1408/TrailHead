import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { SessionContext } from '../src/lib/SessionContext.jsx';

const NAMES = [
  ['devops-cloud', 'DevOps / Cloud Engineer', 'low', 63],
  ['fullstack', 'Web Developer (Full-stack)', 'medium', 59],
  ['support-solutions', 'Support / Solutions Engineer', 'low', 54],
  ['qa-sdet', 'QA / SDET', 'low', 50],
  ['backend', 'Backend Developer', 'medium', 47],
  ['data-analyst', 'Data Analyst', 'low', 38],
  ['ai-apps', 'AI Application Developer', 'low', 23],
  ['product-sde', 'Product-company SDE (DSA-heavy)', 'high', 17],
];

export const makeSession = (overrides = {}) => ({
  id: 's1',
  githubUsername: 'ada',
  freeHours: 2,
  dislikesDsa: true,
  status: 'analyzed',
  profile: {
    username: 'ada', name: 'Ada Lovelace', publicRepos: 3, lowEvidence: false,
    repos: [{ name: 'shop-ui', description: '', language: 'JavaScript', stars: 3, homepage: null, topics: [], pushedAt: '2026-09-01' }],
    skills: [{ id: 'react', label: 'React', evidence: ['shop-ui: topic "react"', 'shop-ui: written partly in JavaScript'] }],
    signals: { hasTests: true, hasCI: false, hasDocker: false, deployedProjects: 1, resumeProvided: true },
  },
  analysis: {
    ranking: NAMES.map(([pathId, name, dsaLevel, fit]) => ({ pathId, name, dsaLevel, fit, rankScore: fit, summary: `${name} summary`, matched: [], missing: [] })),
    explanations: NAMES.slice(0, 3).map(([pathId, name]) => ({
      pathId, summary: `Why ${name} fits.`,
      strengths: [{ skill: 'react', label: 'React', evidence: 'shop-ui: topic "react"' }],
      gaps: [{ id: 'docker', label: 'Docker' }],
    })),
    meta: { attempts: 1, usedFallback: false, llmError: null, model: 'm', provider: 'groq' },
  },
  trials: [], decision: null, chosenPath: null, plan: null,
  ...overrides,
});

export const makePlan = ({ today = 1, doneSeqs = [], days = 30, startDay = (i) => i } = {}) => ({
  days: Array.from({ length: days }, (_, i) => ({
    seq: i + 1, day: startDay(i + 1), title: `Task ${i + 1}`, task: `Do task ${i + 1} carefully`,
    minutes: 60, skill: i % 2 ? 'Docker' : '', done: doneSeqs.includes(i + 1),
  })),
  progress: { done: doneSeqs.length, total: days },
  today,
});

export const makeTrial = (pathId, score = 80, enjoyment = 4) => ({
  pathId, score, enjoyment,
  feedback: {
    feedback: score === 100 ? 'Perfect: 3 of 3 correct.' : 'You got 2 of 3 correct. Read the explanations below.',
    right: score === 100 ? 3 : 2, total: 3,
    review: [
      { question: 'First question?', chosen: 'Right one', correctOption: 'Right one', isCorrect: true, explanation: 'Because it is right.' },
      { question: 'Second question?', chosen: 'Wrong one', correctOption: 'Better one', isCorrect: score === 100, explanation: 'Because better.' },
      { question: 'Third question?', chosen: 'Right again', correctOption: 'Right again', isCorrect: true, explanation: 'Because yes.' },
    ],
  },
});

export const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

export const okConfig = { llm: { provider: 'groq', model: 'openai/gpt-oss-120b', configured: true, modelAvailable: true } };

/** Renders a component inside a router and a fake session context. Returns the spies for every action. */
export function renderWith(ui, { session = null, config = okConfig, route = '/', actions = {} } = {}) {
  const spies = {
    analyze: vi.fn().mockResolvedValue({}), submitTrial: vi.fn().mockResolvedValue({}), decide: vi.fn().mockResolvedValue({}),
    createPlan: vi.fn().mockResolvedValue({}), toggleDay: vi.fn().mockResolvedValue({}), replan: vi.fn().mockResolvedValue({}),
    reset: vi.fn(), ...actions,
  };
  const value = { session, config, booting: false, ...spies };
  const utils = render(
    <SessionContext.Provider value={value}>
      <MemoryRouter initialEntries={[route]} future={ROUTER_FUTURE}>{ui}</MemoryRouter>
    </SessionContext.Provider>,
  );
  return { ...utils, spies };
}
