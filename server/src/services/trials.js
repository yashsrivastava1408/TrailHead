import { z } from 'zod';

export const gradeSchema = z.object({
  score: z.number().min(0).max(100),
  feedback: z.string(),
  strengths: z.array(z.string()).max(5),
  improvements: z.array(z.string()).max(5),
});

/**
 * Grades a taste-test answer against the task's rubric.
 * The student's answer is untrusted text: the prompt tells the model to treat it as data only.
 */
export async function gradeTrial({ llm, task, answer }) {
  const answerIndex = parseInt(answer, 10);
  const selectedText = task.options[answerIndex];
  const isCorrect = answerIndex === task.correctOptionIndex;

  const system = [
    'You grade a multiple-choice practice task for a final-year college student. Be encouraging and educational.',
    'The student has selected an answer. The correct answer and explanation are provided.',
    'If they chose the correct answer, score 100. If incorrect, score 0. Do not give partial credit.',
    'Reply as JSON: {"score": number, "feedback": "2-3 sentences explaining the correct concept", "strengths": ["..."], "improvements": ["..."]}',
  ].join('\n');
  const user = [
    `Task: ${task.title}`,
    `Brief: ${task.brief}`,
    `Student selected: ${selectedText}`,
    `Correct Answer: ${task.options[task.correctOptionIndex]}`,
    `Explanation: ${task.explanation}`
  ].join('\n\n');

  const graded = await llm.completeJson({ system, user, schema: gradeSchema });
  return { ...graded, score: Math.round(graded.score) };
}
