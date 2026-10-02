/** An error that is safe to show to the client. */
export class AppError extends Error {
  constructor(status, message, code = 'app_error') {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export const notFound = (what) => new AppError(404, `${what} not found`, 'not_found');
export const badRequest = (message) => new AppError(400, message, 'bad_request');
export const conflict = (message) => new AppError(409, message, 'conflict');
