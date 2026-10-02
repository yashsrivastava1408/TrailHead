import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TasteTest from '../src/pages/TasteTest.jsx';
import { api } from '../src/lib/api.js';
import { makeSession, makeTrial, renderWith } from './fixtures.jsx';

vi.mock('../src/lib/api.js', () => ({ api: { getTask: vi.fn() } }));

const task = (over = {}) => ({ pathId: 'devops-cloud', title: 'Write a pipeline and a Dockerfile', minutes: 25, brief: 'Write a Dockerfile and a workflow.', starter: '', options: ['Option A', 'Option B'], ...over });
const LONG = '1';

beforeEach(() => { api.getTask.mockImplementation(async (_id, pathId) => task({ pathId, title: `Task for ${pathId}` })); });

describe('Taste test page', () => {
  it('loads the task for the top path and offers the top 3 as tabs', async () => {
    renderWith(<TasteTest />, { session: makeSession() });
    expect(await screen.findByText('Task for devops-cloud')).toBeInTheDocument();
    expect(api.getTask).toHaveBeenCalledWith('s1', 'devops-cloud');
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByText('25 min')).toBeInTheDocument();
  });

  it('switching tabs loads the other path\'s task and clears the draft', async () => {
    renderWith(<TasteTest />, { session: makeSession() });
    await screen.findByText('Task for devops-cloud');
    await userEvent.click(screen.getByRole('radio', { name: /Option B/i }));
    await userEvent.click(screen.getByRole('tab', { name: /Web Developer/ }));
    expect(await screen.findByText('Task for fullstack')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Option A/i })).not.toBeChecked();
  });

  it('opens on the path named in the URL, ignoring paths that are not in the top 3', async () => {
    renderWith(<TasteTest />, { session: makeSession(), route: '/taste-test?path=qa-sdet' });
    expect(await screen.findByText('Task for devops-cloud')).toBeInTheDocument(); // qa-sdet is 4th, so fall back to #1
  });

  it('shows a starter snippet when the task has one', async () => {
    api.getTask.mockResolvedValue(task({ starter: 'function Counter() {}' }));
    renderWith(<TasteTest />, { session: makeSession() });
    expect(await screen.findByText('function Counter() {}')).toBeInTheDocument();
  });

  it('Submit stays disabled until an option and rating are picked', async () => {
    renderWith(<TasteTest />, { session: makeSession() });
    await screen.findByText('Task for devops-cloud');
    const submit = screen.getByRole('button', { name: /submit for grading/i });
    expect(submit).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: /Option A/i }));
    expect(submit).toBeDisabled(); // answer picked but no rating
    await userEvent.click(screen.getByRole('button', { name: /4 · Liked it/ }));
    expect(submit).toBeEnabled();
  });

  it('submits pathId, answer and enjoyment', async () => {
    const { spies } = renderWith(<TasteTest />, { session: makeSession() });
    await screen.findByText('Task for devops-cloud');
    await userEvent.click(screen.getByRole('radio', { name: /Option B/i }));
    await userEvent.click(screen.getByRole('button', { name: /5 · Loved it/ }));
    await userEvent.click(screen.getByRole('button', { name: /submit for grading/i }));
    expect(spies.submitTrial).toHaveBeenCalledWith({ pathId: 'devops-cloud', answer: LONG, enjoyment: 5 });
  });

  it('shows the grader error and lets the student try again', async () => {
    const submitTrial = vi.fn().mockRejectedValueOnce(new Error('The model is rate limited right now.')).mockResolvedValue({});
    renderWith(<TasteTest />, { session: makeSession(), actions: { submitTrial } });
    await screen.findByText('Task for devops-cloud');
    await userEvent.click(screen.getByRole('radio', { name: /Option B/i }));
    await userEvent.click(screen.getByRole('button', { name: /3 · Okay/ }));
    await userEvent.click(screen.getByRole('button', { name: /submit for grading/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('rate limited');
    await userEvent.click(screen.getByRole('button', { name: /submit for grading/i }));
    await waitFor(() => expect(submitTrial).toHaveBeenCalledTimes(2));
  });

  it('shows an earlier result with score, feedback and the "decision" link', async () => {
    renderWith(<TasteTest />, { session: makeSession({ trials: [makeTrial('devops-cloud', 88, 4)] }) });
    expect(await screen.findByText('88')).toBeInTheDocument();
    expect(screen.getByText('Solid answer overall.')).toBeInTheDocument();
    expect(screen.getByText('Clear structure')).toBeInTheDocument();
    expect(screen.getByText('Add tests')).toBeInTheDocument();
    expect(screen.getByText(/replaces the old one/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /see my decision/i })).toHaveAttribute('href', '/decision');
  });

  it('shows the task-loading error', async () => {
    api.getTask.mockRejectedValue(new Error('Taste tests are offered for your top paths only'));
    renderWith(<TasteTest />, { session: makeSession() });
    expect(await screen.findByRole('alert')).toHaveTextContent('top paths only');
  });
});
