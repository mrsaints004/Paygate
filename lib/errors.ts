/**
 * Structured error classes for PayGate.
 * Each error maps to a specific HTTP status code.
 */

export class PaymentValidationError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "PaymentValidationError";
  }
}

export class AuthenticationError extends Error {
  readonly statusCode = 401;
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class RateLimitError extends Error {
  readonly statusCode = 429;
  constructor(message = "Too many requests") {
    super(message);
    this.name = "RateLimitError";
  }
}

export class GatewayError extends Error {
  readonly statusCode = 502;
  constructor(message: string) {
    super(message);
    this.name = "GatewayError";
  }
}

/**
 * Maps an error to the appropriate HTTP status code.
 * Falls back to 500 for unknown error types.
 */
export function toHttpStatus(error: unknown): number {
  if (
    error instanceof PaymentValidationError ||
    error instanceof AuthenticationError ||
    error instanceof RateLimitError ||
    error instanceof GatewayError
  ) {
    return error.statusCode;
  }
  return 500;
}
