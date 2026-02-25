/**
 * Client-side error class hierarchy for the admin panel.
 *
 * Usage:
 *   throw new ApiError('Failed to fetch users', 500, 'INTERNAL_ERROR');
 *   throw new AuthError('Session expired');
 *   throw new ValidationError('App name is required');
 */

export class AppError extends Error {
  code: string;
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ApiError extends AppError {
  constructor(message: string, statusCode = 500, code = 'API_ERROR', details?: unknown) {
    super(message, statusCode, code, details);
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    const body = await response.json().catch(() => ({ error: 'Request failed' }));
    return new ApiError(
      body.error || body.message || 'Request failed',
      response.status,
      body.code || 'API_ERROR',
      body.details
    );
  }
}

export class AuthError extends AppError {
  constructor(message = 'Authentication required', code = 'AUTH_REQUIRED') {
    super(message, 401, code);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}
