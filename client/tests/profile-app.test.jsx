import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Profile from '../src/pages/Profile.jsx';
import Paths from '../src/pages/Paths.jsx';
import App from '../src/App.jsx';
import { makePlan, makeSession, makeTrial, renderWith } from './fixtures.jsx';

describe('Profile page', () => {
  it('Analyse is disabled until a username is typed', async () => {
    renderWith(<Profile />);
    const btn = screen.getByRole('button', { name: /analyse my work/i });
    expect(btn).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/github username/i), '  ada  ');
    expect(btn).toBeEnabled();
  });

  it('sends a trimmed username, the resume, hours as a number and the DSA choice', async () => {
    const { spies } = renderWith(<Profile />);
    await userEvent.type(screen.getByLabelText(/github username/i), '  ada  ');
    await userEvent.type(screen.getByLabelText(/resume text/i), 'I know SQL');
    await userEvent.selectOptions(screen.getByLabelText(/free hours/i), '4');
    await userEvent.click(screen.getByLabelText(/avoid DSA-heavy/i)); // untick
    await userEvent.click(screen.getByRole('button', { name: /analyse my work/i }));
    expect(spies.analyze).toHaveBeenCalledWith({ githubUsername: 'ada', resumeText: 'I know SQL', freeHours: 4, dislikesDsa: false });
  });

  it('shows the server error (e.g. unknown user) and keeps the form', async () => {
    const analyze = vi.fn().mockRejectedValue(new Error('GitHub user not found'));
    renderWith(<Profile />, { actions: { analyze } });
    await userEvent.type(screen.getByLabelText(/github username/i), 'ghost');
    await userEvent.click(screen.getByRole('button', { name: /analyse my work/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('GitHub user not found');
    expect(screen.getByLabelText(/github username/i)).toHaveValue('ghost');
  });

  it('after analysis it shows skills with their evidence, signals and repos', () => {
    renderWith(<Profile />, { session: makeSession() });
    expect(screen.getByText('Skills we can prove')).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('shop-ui: topic "react"')).toBeInTheDocument();
    expect(screen.getByText(/Tests: yes/)).toBeInTheDocument();
    expect(screen.getByText(/CI: none found/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /github/i })).toHaveAttribute('href', 'https://github.com/ada');
  });

  it('"Re-analyse" brings the form back', async () => {
    renderWith(<Profile />, { session: makeSession() });
    await userEvent.click(screen.getByRole('button', { name: /re-analyse/i }));
    expect(screen.getByLabelText(/github username/i)).toBeInTheDocument();
  });

  it('warns when there is little evidence', () => {
    const s = makeSession();
    renderWith(<Profile />, { session: { ...s, profile: { ...s.profile, lowEvidence: true } } });
    expect(screen.getByText('Not much evidence')).toBeInTheDocument();
  });
});

describe('Paths page', () => {
  it('ranks all 8 paths, explains the top 3 with evidence, and links to the taste test', () => {
    renderWith(<Paths />, { session: makeSession({ trials: [makeTrial('devops-cloud')] }) });
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(8);
    expect(screen.getByText('Why DevOps / Cloud Engineer fits.')).toBeInTheDocument();
    expect(screen.getAllByText('shop-ui: topic "react"').length).toBe(3);
    expect(screen.getAllByText('Docker').length).toBe(3); // missing skill chips
    expect(screen.getAllByRole('link', { name: /try this path/i })).toHaveLength(3);
    expect(screen.getByText('tried')).toBeInTheDocument();
    expect(screen.getByText('DSA: high')).toBeInTheDocument();
  });

  it('shows the fallback notice when the model was unavailable', () => {
    const s = makeSession();
    renderWith(<Paths />, { session: { ...s, analysis: { ...s.analysis, meta: { ...s.analysis.meta, usedFallback: true, llmError: 'LLM is not configured' } } } });
    expect(screen.getByText('Simplified explanations')).toBeInTheDocument();
  });
});

describe('App routing', () => {
  it.each(['/paths', '/taste-test', '/decision', '/plan'])('with no session, %s sends the student to the evidence form', async (route) => {
    renderWith(<App />, { session: null, route });
    expect(await screen.findByLabelText(/github username/i)).toBeInTheDocument();
  });

  it('with an analysed session but no trial, /decision goes back to the taste test', async () => {
    renderWith(<App />, { session: makeSession(), route: '/decision' });
    expect(await screen.findByRole('heading', { name: 'Taste test' })).toBeInTheDocument();
  });

  it('with a trial but no chosen path, /plan goes back to the decision', async () => {
    renderWith(<App />, { session: makeSession({ trials: [makeTrial('devops-cloud')] }), route: '/plan' });
    expect(await screen.findByRole('heading', { name: 'Your decision' })).toBeInTheDocument();
  });

  it('with a chosen path, /plan opens', async () => {
    renderWith(<App />, { session: makeSession({ trials: [makeTrial('devops-cloud')], chosenPath: 'devops-cloud', plan: makePlan() }), route: '/plan' });
    expect(await screen.findByText('0 of 30 days complete')).toBeInTheDocument();
  });

  it('unknown routes land on the overview', async () => {
    renderWith(<App />, { session: null, route: '/nope' });
    expect(await screen.findByText(/Try the path/i)).toBeInTheDocument();
  });

  it('shows skeletons while the saved session is loading', () => {
    const { container } = renderWith(<App />, { session: null });
    expect(container.querySelector('.sidebar')).toBeInTheDocument();
  });
});
