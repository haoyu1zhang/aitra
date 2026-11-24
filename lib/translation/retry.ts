import { normalizeError, type TranslateError } from '../errors';
import { sleep } from '../providers/types';

export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  signal: AbortSignal;
  /** Return false to stop retrying, e.g. once part of a stream was shown. */
  canRetry?: (error: TranslateError) => boolean;
  onRetry?: (error: TranslateError, attempt: number) => void;
}

export async function withRetry<T>(task: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await task(attempt);
    } catch (raw) {
      const error = normalizeError(raw);
      const allowed = error.retryable && attempt < options.retries && (options.canRetry?.(error) ?? true);
      if (!allowed || options.signal.aborted) throw error;
      options.onRetry?.(error, attempt);
      const delay = options.baseDelayMs * 2 ** attempt * (0.75 + Math.random() * 0.5);
      await sleep(delay, options.signal);
      attempt++;
    }
  }
}
