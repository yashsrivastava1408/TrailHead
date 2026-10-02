import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Plan from '../src/pages/Plan.jsx';
import { makePlan, makeSession, makeTrial, renderWith } from './fixtures.jsx';

const base = { trials: [makeTrial('devops-cloud')], chosenPath: 'devops-cloud' };
const withPlan = (plan, extra = {}) => makeSession({ ...base, plan, ...extra });

describe('Plan page', () => {
  it('before a plan exists it offers to create one and calls createPlan', async () => {
    const { spies } = renderWith(<Plan />, { session: makeSession(base) });
    await userEvent.click(screen.getByRole('button', { name: /create my plan/i }));
    expect(spies.createPlan).toHaveBeenCalledOnce();
  });

  it('shows the error if creating the plan fails, and recovers', async () => {
    const createPlan = vi.fn().mockRejectedValueOnce(new Error('The model is rate limited right now.'));
    renderWith(<Plan />, { session: makeSession(base), actions: { createPlan } });
    await userEvent.click(screen.getByRole('button', { name: /create my plan/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('rate limited');
    expect(screen.getByRole('button', { name: /create my plan/i })).toBeEnabled();
  });

  it('renders 30 days grouped into weeks with progress', () => {
    renderWith(<Plan />, { session: withPlan(makePlan({ doneSeqs: [1, 2, 3] })) });
    expect(screen.getAllByRole('checkbox')).toHaveLength(30);
    for (const w of [1, 2, 3, 4, 5]) expect(screen.getByText(`Week ${w}`)).toBeInTheDocument();
    expect(screen.getByText('3 of 30 days complete')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox').filter((c) => c.checked)).toHaveLength(3);
  });

  it('ticking a day calls toggleDay with its seq and the new value; unticking sends false', async () => {
    const { spies } = renderWith(<Plan />, { session: withPlan(makePlan({ doneSeqs: [2] })) });
    await userEvent.click(screen.getByRole('checkbox', { name: /Task 1\b/ }));
    expect(spies.toggleDay).toHaveBeenCalledWith(1, true);
    await userEvent.click(screen.getByRole('checkbox', { name: /Task 2\b/ }));
    expect(spies.toggleDay).toHaveBeenCalledWith(2, false);
  });

  it('flags missed days and offers "Adjust for missed days"', async () => {
    const { spies } = renderWith(<Plan />, { session: withPlan(makePlan({ today: 4, doneSeqs: [1] })) });
    expect(screen.getAllByText('missed')).toHaveLength(2); // days 2 and 3
    expect(screen.getByText('today')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /adjust for missed days/i }));
    expect(spies.replan).toHaveBeenCalledOnce();
  });

  it('shows no "missed" chips and no adjust button when on track', () => {
    renderWith(<Plan />, { session: withPlan(makePlan({ today: 3, doneSeqs: [1, 2] })) });
    expect(screen.queryByText('missed')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /adjust for missed days/i })).not.toBeInTheDocument();
  });

  it('explains when the plan came from the template fallback', () => {
    renderWith(<Plan />, { session: withPlan(makePlan(), { planSource: 'fallback', planNote: 'plan model exploded' }) });
    expect(screen.getByText(/built from a template/i)).toBeInTheDocument();
    expect(screen.getByText(/plan model exploded/)).toBeInTheDocument();
  });

  it('a finished task keeps showing after a re-plan moved other tasks (grouped by plan order, not date)', () => {
    const plan = makePlan({ today: 8, doneSeqs: [1], startDay: (seq) => (seq === 1 ? 1 : seq + 6) });
    renderWith(<Plan />, { session: withPlan(plan) });
    const week1 = screen.getByText('Week 1').closest('.week');
    expect(within(week1).getByText('Task 1')).toBeInTheDocument();
    expect(within(week1).getByText('Task 7')).toBeInTheDocument();
  });
});
