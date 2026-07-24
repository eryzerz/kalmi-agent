import { TransientError, PermanentError, classifyError } from './errors.js';

const MAX_ATTEMPTS = 5;
const PER_ATTEMPT_TIMEOUT_MS = 30_000;
const TOTAL_DEADLINE_MS = 60_000;

export interface RetryConfig {
  maxAttempts?: number;
  perAttemptTimeoutMs?: number;
  totalDeadlineMs?: number;
  onAttempt?: (attempt: number, error: unknown) => void;
}

export class DeadlineExceededError extends Error {
  constructor() {
    super(`Operation exceeded the total deadline of ${TOTAL_DEADLINE_MS}ms`);
    this.name = 'DeadlineExceededError';
  }
}

export class MaxRetriesExceededError extends Error {
  constructor(public readonly lastError: unknown) {
    const msg = lastError instanceof Error ? lastError.message : String(lastError);
    super(`Operation failed after ${MAX_ATTEMPTS} attempts: ${msg}`);
    this.name = 'MaxRetriesExceededError';
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  if (timeoutMs <= 0) return promise;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TransientError('Operation timed out')), timeoutMs);

    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer);
        reject(new TransientError('Operation aborted'));
        return;
      }
      const onAbort = () => {
        clearTimeout(timer);
        reject(new TransientError('Operation aborted'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      promise.then(
        (v) => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); resolve(v); },
        (e) => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); reject(e); },
      );
    } else {
      promise.then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); },
      );
    }
  });
}

export async function retry<T>(
  fn: (attempt: number, signal: AbortSignal) => Promise<T>,
  config: RetryConfig = {},
): Promise<T> {
  const maxAttempts = config.maxAttempts ?? MAX_ATTEMPTS;
  const perAttemptTimeoutMs = config.perAttemptTimeoutMs ?? PER_ATTEMPT_TIMEOUT_MS;
  const totalDeadlineMs = config.totalDeadlineMs ?? TOTAL_DEADLINE_MS;

  const deadlineController = new AbortController();
  const deadlineTimer = totalDeadlineMs > 0
    ? setTimeout(() => deadlineController.abort(), totalDeadlineMs)
    : null;

  let lastError: unknown;

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (deadlineController.signal.aborted) {
        throw new DeadlineExceededError();
      }

      try {
        const attemptController = new AbortController();
        const linkedSignal = deadlineController.signal;

        deadlineController.signal.addEventListener('abort', () => attemptController.abort(), { once: true });

        return await withTimeout(fn(attempt, attemptController.signal), perAttemptTimeoutMs, attemptController.signal);
      } catch (err) {
        lastError = err;

        const classified = classifyError(err);

        if (classified instanceof PermanentError) {
          throw classified;
        }

        config.onAttempt?.(attempt, err);

        if (attempt >= maxAttempts) {
          throw new MaxRetriesExceededError(lastError);
        }

        await delay(attempt);
      }
    }

    throw new MaxRetriesExceededError(lastError);
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
  }
}

async function delay(attempt: number): Promise<void> {
  const ms = Math.min(100 * Math.pow(2, attempt - 1), 5000);
  await new Promise((resolve) => setTimeout(resolve, ms));
}
