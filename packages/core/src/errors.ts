import { ZodError } from 'zod';

export class TransientError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'TransientError';
  }
}

export class PermanentError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PermanentError';
  }
}

export class PartialResultError<T = unknown> extends Error {
  constructor(
    message: string,
    public readonly partial: Partial<T>,
    public readonly missingFields: string[],
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PartialResultError';
  }
}

export class MalformedDataError extends Error {
  constructor(
    message: string,
    public readonly source: string,
    public readonly validationErrors: string[],
    public readonly rawPayload?: unknown,
  ) {
    super(message);
    this.name = 'MalformedDataError';
  }
}

export function classifyError(err: unknown): TransientError | PermanentError {
  if (err instanceof TransientError || err instanceof PermanentError) return err;
  if (err instanceof MalformedDataError || err instanceof PartialResultError) {
    return new PermanentError(err.message, err);
  }

  const message = err instanceof Error ? err.message : String(err);
  const code = (err as any)?.code;
  const status = (err as any)?.status ?? (err as any)?.statusCode;
  const type = (err as any)?.type;

  if (status === 429 || status === 503 || status === 504 || status === 502) {
    return new TransientError(message, err);
  }

  if (status === 401 || status === 403 || status === 404 || status === 422) {
    return new PermanentError(message, err);
  }

  if (code === 'ECONNREFUSED' || code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' || code === 'ENOTFOUND' ||
    code === 'EPIPE' || code === 'ERR_STREAM_DESTROYED') {
    return new TransientError(message, err);
  }

  if (type === 'connection_error' || type === 'rate_limit_error') {
    return new TransientError(message, err);
  }

  if (type === 'authentication_error' || type === 'invalid_request_error') {
    return new PermanentError(message, err);
  }

  return new PermanentError(message, err);
}

export function formatZodErrors(error: ZodError): string[] {
  return error.issues.map((e) => {
    const path = e.path.length > 0 ? e.path.join('.') : '<root>';
    return `${path}: ${e.message ?? 'Invalid value'}`;
  });
}
