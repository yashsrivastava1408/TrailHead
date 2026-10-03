import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TasteTest from '../src/pages/TasteTest.jsx';
import { api } from '../src/lib/api.js';
import { makeSession, makeTrial, renderWith } from './fixtures.jsx';

vi.mock('../src/lib/api.js', () => ({ api: { getTask: vi.fn() } }));

const question = (n, over = {}) => ({ brief: `Question text ${n}`, starter: '', options: [`Option ${n}A`, `Option ${n}B`, `Option ${n}C`], ...over });
const task = (over = {}) => ({ pathId: 'devops-cloud', title: 'DevOps quick check', minutes: 3, questions: [question(1), question(2), question(3)], ...over });

const pick = (qi, option) => userEvent.click(screen.getByRole('radio', { name: new RegExp(`Option ${qi + 1}${option}`) }));
const rate = (label) => userEvent.click(screen.getByRole('button', { name: new RegExp(label) }));
const submit = () => screen.getByRole('button', { name: /submit for grading/i });
const answerAll = async () => { await pick(0, 'A'); await pick(1, 'C'); await pick(2, 'B'); };

beforeEach(() => { api.getTask.mockImplementation(async (_id, pathId) => task({ pathId, title: `Task for ${pathId}` })); });

describe('Taste test page', () => {
  it('loads the task for the top path, offers the top 3 as tabs, and shows all three questions', async () => {
    renderWith(<TasteTest />, { session: makeSession() });
    expect(await screen.findByText('Task for devops-cloud')).toBeInTheDocument();
    expect(api.getTask).toHaveBeenCalledWith('s1', 'devops-cloud');
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByText(/~3 min/)).toBeInTheDocument();
    for (const n of [1, 2, 3]) expect(screen.getByText(`Question text ${n}`)).toBeInTheDocument();
    expect(screen.getByText('Question 2 of 3')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(9);
  });

  it("switching tabs loads the other path's task and clears every chosen answer", async () => {
    renderWith(<TasteTest />, { session: makeSession() });
    await screen.findByText('Task for devops-cloud');
    await pick(0, 'B');
    await userEvent.click(screen.getByRole('tab', { name: /Web Developer/ }));
    expect(await screen.findByText('Task for fullstack')).toBeInTheDocument();
    expect(screen.getAllByRole('radio').filter((r) => r.checked)).toHaveLength(0);
  });

  it('opens on the path named in the URL, ignoring paths that are not in the top 3', async () => {
    renderWith(<TasteTest />, { session: makeSession(), route: '/taste-test?path=qa-sdet' });
    expect(await screen.findByText('Task for devops-cloud')).toBeInTheDocument(); // qa-sdet is 4th, so fall back to #1
  });

  it('shows a code snippet on the question that has one', async () => {
    api.getTask.mockResolvedValue(task({ questions: [question(1, { starter: 'function Counter() {}' }), question(2), question(3)] }));
    renderWith(<TasteTest />, { session: makeSession() });
    expect(await screen.findByText('function Counter() {}')).toBeInTheDocument();
  });

  it('each question is its own radio group, so choosing in one does not change another', async () => {
    renderWith(<TasteTest />, { session: makeSession() });
    await screen.findByText('Task for devops-cloud');
    await pick(0, 'A'); await pick(1, 'B'); await pick(0, 'C');
    const checked = screen.getAllByRole('radio').filter((r) => r.checked).map((r) => r.closest('label').textContent);
    expect(checked.sort()).toEqual(['Option 1C', 'Option 2B']);
  });

  it('Submit stays disabled until ALL questions are answered AND an enjoyment rating is picked', async () => {
    renderWith(<TasteTest />, { session: makeSession() });
    await screen.findByText('Task for devops-cloud');
    expect(submit()).toBeDisabled();
    await pick(0, 'A'); await pick(1, 'A');
    await rate('Liked it');
    expect(submit()).toBeDisabled(); // only 2 of 3 answered
    await pick(2, 'A');
    expect(submit()).toBeEnabled();
  });

  it('Submit stays disabled with every question answered but no rating', async () => {
    renderWith(<TasteTest />, { session: makeSession() });
    await screen.findByText('Task for devops-cloud');
    await answerAll();
    expect(submit()).toBeDisabled();
    await rate('Loved it');
    expect(submit()).toBeEnabled();
  });

  it('submits pathId, one answer per question in order, and enjoyment', async () => {
    const { spies } = renderWith(<TasteTest />, { session: makeSession() });
    await screen.findByText('Task for devops-cloud');
    await answerAll();
    await rate('Loved it');
    await userEvent.click(submit());
    expect(spies.submitTrial).toHaveBeenCalledWith({ pathId: 'devops-cloud', answers: ['0', '2', '1'], enjoyment: 5 });
  });

  it('shows the server error (e.g. invalid answers) and lets the student try again', async () => {
    const submitTrial = vi.fn().mockRejectedValueOnce(new Error('Answer all 3 questions')).mockResolvedValue({});
    renderWith(<TasteTest />, { session: makeSession(), actions: { submitTrial } });
    await screen.findByText('Task for devops-cloud');
    await answerAll();
    await rate('Okay');
    await userEvent.click(submit());
    expect(await screen.findByRole('alert')).toHaveTextContent('Answer all 3 questions');
    await userEvent.click(submit());
    await waitFor(() => expect(submitTrial).toHaveBeenCalledTimes(2));
  });

  it('shows the score, "x of 3 correct" and a review of every question after answering', async () => {
    renderWith(<TasteTest />, { session: makeSession({ trials: [makeTrial('devops-cloud', 67, 4)] }) });
    expect(await screen.findByText('67')).toBeInTheDocument();
    expect(screen.getByText('2 of 3 correct')).toBeInTheDocument();
    expect(screen.getByText(/You got 2 of 3 correct/)).toBeInTheDocument();
    const reviews = document.querySelectorAll('.review');
    expect(reviews).toHaveLength(3);
    expect([...reviews].map((r) => r.dataset.correct)).toEqual(['true', 'false', 'true']);
    const wrong = reviews[1];
    expect(within(wrong).getByText('Not quite')).toBeInTheDocument();
    expect(within(wrong).getByText(/You chose: Wrong one/)).toBeInTheDocument();
    expect(within(wrong).getByText('Better one')).toBeInTheDocument();
    expect(within(wrong).getByText('Because better.')).toBeInTheDocument();
    expect(within(reviews[0]).queryByText(/You chose/)).not.toBeInTheDocument();
    expect(screen.getByText(/replace the old ones/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /see my decision/i })).toHaveAttribute('href', '/decision');
  });

  it('a perfect score is celebrated and every review is marked correct', async () => {
    renderWith(<TasteTest />, { session: makeSession({ trials: [makeTrial('devops-cloud', 100, 5)] }) });
    expect(await screen.findByText('3 of 3 correct')).toBeInTheDocument();
    expect(screen.getByText('Perfect: 3 of 3 correct.')).toBeInTheDocument();
    expect([...document.querySelectorAll('.review')].every((r) => r.dataset.correct === 'true')).toBe(true);
  });

  it('still shows older single-question results saved before the quiz had three questions', async () => {
    const legacy = { pathId: 'devops-cloud', score: 0, enjoyment: 3, feedback: { feedback: 'Not quite.', strengths: [], improvements: ['Review the explanation above, then try again'] } };
    renderWith(<TasteTest />, { session: makeSession({ trials: [legacy] }) });
    expect(await screen.findByText('Not quite.')).toBeInTheDocument();
    expect(screen.queryByText('Did well')).not.toBeInTheDocument();
    expect(screen.getByText('To improve')).toBeInTheDocument();
  });

  it('shows the task-loading error', async () => {
    api.getTask.mockRejectedValue(new Error('Taste tests are offered for your top paths only'));
    renderWith(<TasteTest />, { session: makeSession() });
    expect(await screen.findByRole('alert')).toHaveTextContent('top paths only');
  });
});
