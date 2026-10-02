import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Sidebar from '../src/components/Sidebar.jsx';
import { makePlan, makeSession, makeTrial, okConfig, renderWith } from './fixtures.jsx';

const link = (name) => screen.getByRole('link', { name: new RegExp(name, 'i') });

describe('Sidebar', () => {
  it('with no session only Overview and Your evidence are open', () => {
    renderWith(<Sidebar />);
    expect(link('Overview')).not.toHaveClass('locked');
    expect(link('Your evidence')).not.toHaveClass('locked');
    for (const name of ['Paths', 'Taste test', 'Decision', '30-day plan']) expect(link(name)).toHaveClass('locked');
  });

  it('unlocks steps as the student progresses', () => {
    const { unmount } = renderWith(<Sidebar />, { session: makeSession() });
    expect(link('Paths')).not.toHaveClass('locked');
    expect(link('Taste test')).not.toHaveClass('locked');
    expect(link('Decision')).toHaveClass('locked');
    expect(link('30-day plan')).toHaveClass('locked');
    unmount();

    renderWith(<Sidebar />, { session: makeSession({ trials: [makeTrial('qa-sdet')] }) });
    expect(link('Decision')).not.toHaveClass('locked');
    expect(link('30-day plan')).toHaveClass('locked');
  });

  it('opens the plan once a path is chosen', () => {
    renderWith(<Sidebar />, { session: makeSession({ trials: [makeTrial('qa-sdet')], chosenPath: 'qa-sdet', plan: makePlan() }) });
    expect(link('30-day plan')).not.toHaveClass('locked');
  });

  it('shows who is signed in and lets them start over', async () => {
    const { spies } = renderWith(<Sidebar />, { session: makeSession() });
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('@ada')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /start over/i }));
    expect(spies.reset).toHaveBeenCalledOnce();
  });

  it('does not show a user card or "start over" with no session', () => {
    renderWith(<Sidebar />);
    expect(screen.queryByRole('button', { name: /start over/i })).not.toBeInTheDocument();
  });

  it.each([
    ['everything fine', okConfig, 'groq'],
    ['no API key', { llm: { ...okConfig.llm, configured: false } }, 'no API key'],
    ['model not available to the key', { llm: { ...okConfig.llm, modelAvailable: false } }, /model not available/],
    ['server unreachable', null, 'unreachable'],
  ])('model badge: %s', (_name, config, text) => {
    renderWith(<Sidebar />, { config });
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('unknown model availability (null) is not shown as an error', () => {
    renderWith(<Sidebar />, { config: { llm: { ...okConfig.llm, modelAvailable: null } } });
    expect(screen.getByText('groq')).toBeInTheDocument();
  });
});
