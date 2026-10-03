import { badRequest } from '../errors.js';

/**
 * Checks the answers sent for a taste test: one option index per question, in order.
 * Anything that is not a real option for that question is a client error.
 */
export function parseAnswers(task, answers) {
  if (!Array.isArray(answers) || answers.length !== task.questions.length) {
    throw badRequest(`Answer all ${task.questions.length} questions`);
  }
  return answers.map((answer, i) => {
    const text = String(answer).trim();
    if (!/^\d+$/.test(text)) throw badRequest(`Pick one of the options for question ${i + 1}`);
    const index = Number(text);
    if (index >= task.questions[i].options.length) throw badRequest(`Question ${i + 1} has no such option`);
    return index;
  });
}

/**
 * Grades a multiple-choice taste test. Comparing numbers does not need a model, so this is
 * instant, free, never rate limited, and always gives the same result.
 * The score is the share of questions answered correctly. The hand-written explanations
 * (and the right answers) are returned only now, after the student has answered.
 */
export function gradeTrial({ task, answers }) {
  const chosen = parseAnswers(task, answers);
  const review = task.questions.map((question, i) => ({
    question: question.brief,
    chosen: question.options[chosen[i]],
    correctOption: question.options[question.correctOptionIndex],
    isCorrect: chosen[i] === question.correctOptionIndex,
    explanation: question.explanation,
  }));
  const right = review.filter((r) => r.isCorrect).length;
  const total = review.length;
  return {
    score: Math.round((right / total) * 100),
    feedback: right === total ? `Perfect: ${right} of ${total} correct.` : `You got ${right} of ${total} correct. Read the explanations below.`,
    right,
    total,
    review,
  };
}
