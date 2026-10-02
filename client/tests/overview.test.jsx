import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import Overview from '../src/pages/Overview.jsx';
import { makePlan, makeSession, makeTrial, renderWith } from './fixtures.jsx';

const withAnalysis = (meta, profile = {}) => {
  const s = makeSession();
  return { ...s, analysis: { ...s.analysis, meta: { ...s.analysis.meta, ...meta } }, profile: { ...s.profile, ...profile } };
};

describe('Overview page', () => {
  it('shows the landing page when there is no session', () => {
    renderWith(<Overview />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Try the path before you pick it/i);
    expect(screen.getByRole('link', { name: /get started/i })).toHaveAttribute('href', '/profile');
    expect(screen.getByText('Evidence, not quizzes')).toBeInTheDocument();
  });

  it('greets the student and shows live numbers', () => {
    renderWith(<Overview />, { session: makeSession() });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hi Ada Lovelace');
    expect(screen.getByText('63%')).toBeInTheDocument(); // best fit
    expect(screen.getByText('1 repos read')).toBeInTheDocument();
    expect(screen.getAllByText(/fit$/).length).toBeGreaterThanOrEqual(3);
  });

  it.each([
    ['no trials yet', makeSession(), /take your first taste test/i, '/taste-test'],
    ['tried but not chosen', makeSession({ trials: [makeTrial('qa-sdet')] }), /make your decision/i, '/decision'],
    ['chosen, no plan', makeSession({ trials: [makeTrial('qa-sdet')], chosenPath: 'qa-sdet' }), /create your 30-day plan/i, '/plan'],
    ['plan under way', makeSession({ trials: [makeTrial('qa-sdet')], chosenPath: 'qa-sdet', plan: makePlan({ doneSeqs: [1] }) }), /continue your plan/i, '/plan'],
  ])('the main button points to the next step: %s', (_n, session, label, href) => {
    renderWith(<Overview />, { session });
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
  });

  it('shows plan progress as a percentage', () => {
    renderWith(<Overview />, { session: makeSession({ trials: [makeTrial('qa-sdet')], chosenPath: 'qa-sdet', plan: makePlan({ doneSeqs: [1, 2, 3] }) }) });
    expect(screen.getByText('3 of 30 days')).toBeInTheDocument();
    expect(screen.getAllByText('10%').length).toBeGreaterThan(0);
  });

  it('warns about low evidence', () => {
    renderWith(<Overview />, { session: withAnalysis({}, { lowEvidence: true }) });
    expect(screen.getByText('Not much to go on yet')).toBeInTheDocument();
  });

  it('says so when the explanations came from the fallback, with the reason', () => {
    renderWith(<Overview />, { session: withAnalysis({ usedFallback: true, llmError: 'LLM is not configured' }) });
    expect(screen.getByText(/explanations are simplified/i)).toBeInTheDocument();
    expect(screen.getByText(/LLM is not configured/)).toBeInTheDocument();
  });

  it('shows no warnings for a healthy analysis', () => {
    renderWith(<Overview />, { session: makeSession() });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
