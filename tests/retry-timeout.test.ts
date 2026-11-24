import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranslateError } from '../lib/errors';
import { withRetry } from '../lib/translation/retry';
import { createDeadline } from '../lib/translation/timeout';

describe('withRetry', () => {
  const signal = new AbortController().signal;

  it('retries a transient failure once', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls === 1) throw new TranslateError('NETWORK');
      return 'ok';
    }, { retries: 1, baseDelayMs: 1, signal });
    expect(result).toBe('ok');
    expect(calls).toBe(2);
  });

  it('does not retry permanent errors', async () => {
    let calls = 0;
    await expect(withRetry(async () => {
      calls++;
      throw new TranslateError('INVALID_KEY');
    }, { retries: 3, baseDelayMs: 1, signal })).rejects.toMatchObject({ code: 'INVALID_KEY' });
    expect(calls).toBe(1);
  });

  it('respects canRetry', async () => {
    let calls = 0;
    await expect(withRetry(async () => {
      calls++;
      throw new TranslateError('TIMEOUT');
    }, { retries: 2, baseDelayMs: 1, signal, canRetry: () => false })).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(calls).toBe(1);
  });
});

describe('createDeadline', () => {
  afterEach(() => vi.useRealTimers());

  it('aborts with TIMEOUT when nothing arrives', () => {
    vi.useFakeTimers();
    const d = createDeadline(new AbortController().signal, { firstResponseMs: 100, totalMs: 1000 });
    vi.advanceTimersByTime(101);
    expect(d.signal.aborted).toBe(true);
    expect((d.signal.reason as TranslateError).code).toBe('TIMEOUT');
    d.dispose();
  });

  it('keeps going after progress until the total limit', () => {
    vi.useFakeTimers();
    const d = createDeadline(new AbortController().signal, { firstResponseMs: 100, totalMs: 1000 });
    vi.advanceTimersByTime(50);
    d.progress();
    vi.advanceTimersByTime(500);
    expect(d.signal.aborted).toBe(false);
    vi.advanceTimersByTime(500);
    expect(d.signal.aborted).toBe(true);
    d.dispose();
  });

  it('follows the parent signal', () => {
    const parent = new AbortController();
    const d = createDeadline(parent.signal, { firstResponseMs: 1000, totalMs: 1000 });
    parent.abort(new TranslateError('CANCELLED'));
    expect((d.signal.reason as TranslateError).code).toBe('CANCELLED');
    d.dispose();
  });
});
