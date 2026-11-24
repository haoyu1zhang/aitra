import { describe, expect, it } from 'vitest';
import { TranslateError, errorFromStatus, normalizeError } from '../lib/errors';
import { redact } from '../lib/providers/http';

describe('errors', () => {
  it('maps HTTP status codes', () => {
    expect(errorFromStatus(401).code).toBe('INVALID_KEY');
    expect(errorFromStatus(403).code).toBe('INVALID_KEY');
    expect(errorFromStatus(429).code).toBe('RATE_LIMITED');
    expect(errorFromStatus(456).code).toBe('QUOTA_EXCEEDED');
    expect(errorFromStatus(402).code).toBe('QUOTA_EXCEEDED');
    expect(errorFromStatus(503).code).toBe('SERVER_ERROR');
    expect(errorFromStatus(404).code).toBe('BAD_CONFIG');
  });

  it('marks only transient errors as retryable', () => {
    expect(new TranslateError('RATE_LIMITED').retryable).toBe(true);
    expect(new TranslateError('TIMEOUT').retryable).toBe(true);
    expect(new TranslateError('INVALID_KEY').retryable).toBe(false);
    expect(new TranslateError('NO_API_KEY').retryable).toBe(false);
  });

  it('normalizes thrown values', () => {
    expect(normalizeError(new TypeError('Failed to fetch')).code).toBe('NETWORK');
    expect(normalizeError(new DOMException('x', 'AbortError')).code).toBe('CANCELLED');
    expect(normalizeError(new DOMException('x', 'TimeoutError')).code).toBe('TIMEOUT');
    expect(normalizeError('boom').code).toBe('UNKNOWN');
  });

  it('includes provider detail in the message', () => {
    const info = new TranslateError('INVALID_KEY', 'Authentication Fails').toInfo();
    expect(info.message).toContain('Authentication Fails');
  });

  it('redacts things that look like keys', () => {
    expect(redact('Incorrect API key provided: sk-abc123def456')).not.toContain('abc123');
    expect(redact('key 0d2f0d8e-1111-2222-3333-444455556666:fx bad')).toBe('key *** bad');
  });
});
