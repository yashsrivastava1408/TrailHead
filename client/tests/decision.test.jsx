import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import Decision from '../src/pages/Decision.jsx';
import { api } from '../src/lib/api.js';
import { makeSession, makeTrial, renderWith } from './fixtures.jsx';

vi.mock('../src/lib/api.js', () => ({ api: { previewDecision: vi.fn() } }));

const preview = (over = {}) => ({
  weights: { fit: 0.4, performance: 0.35, enjoyment: 0.25 },
  options: [
    { pathId: 'qa-sdet', name: 'QA / SDET', combined: 77, fit: 50, performance: 90, enjoyment: 100 },
    { pathId: 'fullstack', name: 'Web Developer (Full-stack)', combined: 50, fit: 59, performance: 50, enjoyment: 0 },
  ],
  recommended: 'qa-sdet', reason: 'QA / SDET scored highest overall (77/100).', chosenPath: null, ...over,
});
const session = makeSession({ trials: [makeTrial('qa-sdet', 90, 5), makeTrial('fullstack', 50, 1)] });
const page = (props) => renderWith(
  <Routes><Route path="/" element={<Decision />} /><Route path="/plan" element={<div>PLAN PAGE</div>} /></Routes>,
  { session, ...props },
);

describe('Decision page', () => {
  it('loads a read-only preview and recommends the best option', async () => {
    api.previewDecision.mockResolvedValue(preview());
    page();
    expect(await screen.findByText('recommended')).toBeInTheDocument();
    expect(api.previewDecision).toHaveBeenCalledWith('s1');
    expect(screen.getByText(/scored highest overall/)).toBeInTheDocument();
    expect(screen.getAllByRole('radio').find((r) => r.checked).closest('.card')).toHaveTextContent('QA / SDET');
  });

  it('confirming the recommendation saves it and moves on to the plan', async () => {
    api.previewDecision.mockResolvedValue(preview());
    const { spies } = page();
    await userEvent.click(await screen.findByRole('button', { name: /choose this path/i }));
    expect(spies.decide).toHaveBeenCalledWith('qa-sdet');
    expect(await screen.findByText('PLAN PAGE')).toBeInTheDocument();
  });

  it('lets the student override with another tried path', async () => {
    api.previewDecision.mockResolvedValue(preview());
    const { spies } = page();
    await userEvent.click(await screen.findByText('Web Developer (Full-stack)'));
    await userEvent.click(screen.getByRole('button', { name: /choose this path/i }));
    expect(spies.decide).toHaveBeenCalledWith('fullstack');
  });

  it('keeps an earlier choice selected when revisiting', async () => {
    api.previewDecision.mockResolvedValue(preview({ chosenPath: 'fullstack' }));
    page();
    await screen.findByText('recommended');
    expect(screen.getAllByRole('radio').find((r) => r.checked).closest('.card')).toHaveTextContent('Web Developer');
  });

  it('shows the score breakdown with its weights', async () => {
    api.previewDecision.mockResolvedValue(preview());
    page();
    await screen.findByText('recommended');
    expect(screen.getAllByText(/×0.4/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/×0.35/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/×0.25/).length).toBeGreaterThan(0);
  });

  it('shows an error if saving fails and stays on the page', async () => {
    api.previewDecision.mockResolvedValue(preview());
    const { spies } = page();
    spies.decide.mockRejectedValueOnce(new Error('You can only choose a path you have tried'));
    await userEvent.click(await screen.findByRole('button', { name: /choose this path/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('only choose a path you have tried');
    expect(screen.queryByText('PLAN PAGE')).not.toBeInTheDocument();
  });

  it('shows the preview error instead of hanging', async () => {
    api.previewDecision.mockRejectedValue(new Error('Try at least one taste test before deciding'));
    page();
    await waitFor(() => expect(screen.getByText(/Try at least one taste test/)).toBeInTheDocument());
  });
});
