import { TranslateError } from '../errors';

export interface Deadline {
  signal: AbortSignal;
  /** Call when the provider shows signs of life (first chunk, response headers). */
  progress(): void;
  dispose(): void;
}

/**
 * Aborts when the parent signal aborts, when nothing has arrived within
 * `firstResponseMs`, or when the whole request exceeds `totalMs`.
 */
export function createDeadline(
  parent: AbortSignal,
  { firstResponseMs, totalMs }: { firstResponseMs: number; totalMs: number },
): Deadline {
  const controller = new AbortController();
  const timeout = () => controller.abort(new TranslateError('TIMEOUT'));

  let firstTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(timeout, firstResponseMs);
  const totalTimer = setTimeout(timeout, totalMs);

  const onParentAbort = () => controller.abort(parent.reason);
  if (parent.aborted) onParentAbort();
  else parent.addEventListener('abort', onParentAbort, { once: true });

  return {
    signal: controller.signal,
    progress() {
      if (firstTimer !== undefined) {
        clearTimeout(firstTimer);
        firstTimer = undefined;
      }
    },
    dispose() {
      clearTimeout(firstTimer);
      clearTimeout(totalTimer);
      parent.removeEventListener('abort', onParentAbort);
    },
  };
}
