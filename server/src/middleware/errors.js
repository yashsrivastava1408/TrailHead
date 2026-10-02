import { ZodError } from 'zod';
import { AppError } from '../errors.js';

export const notFoundHandler = (_req, res) => res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });

/** One place that turns any thrown error into a clean JSON response. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    const message = err.issues.map((i) => i.message).join('; ');
    return res.status(400).json({ error: { code: 'validation_error', message } });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'payload_too_large', message: 'That request is too large' } });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'bad_json', message: 'Request body is not valid JSON' } });
  }
  console.error(err);
  return res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong on our side' } });
}
