import { describe, expect, it } from 'vitest';
import { SETTINGS_ERRORS, TranslateError, describeError, errorFromStatus, normalizeError } from '../lib/errors';
import { createTranslator } from '../lib/i18n';
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

  it('describes errors in the UI language, with detail', () => {
    const info = new TranslateError('INVALID_KEY', 'Authentication Fails').toInfo();
    expect(info.detail).toBe('Authentication Fails');
    expect(describeError(createTranslator('en'), info)).toMatch(/invalid.*\(Authentication Fails\)$/);
    expect(describeError(createTranslator('zh-CN'), info)).toBe('API Key 无效或没有权限，请检查设置。（Authentication Fails）');

    const own = new TranslateError('BAD_CONFIG', { key: 'detail.noModel' }).toInfo();
    expect(own.detailKey).toBe('detail.noModel');
    expect(describeError(createTranslator('de'), own)).toContain('kein Modellname');
  });

  it('redacts things that look like keys', () => {
    expect(redact('Incorrect API key provided: sk-abc123def456')).not.toContain('abc123');
    expect(redact('key 0d2f0d8e-1111-2222-3333-444455556666:fx bad')).toBe('key *** bad');
  });

  it('only links to settings for problems fixed there', () => {
    expect(SETTINGS_ERRORS.has('NOT_CONFIGURED')).toBe(true);
    expect(SETTINGS_ERRORS.has('BUILTIN_UNAVAILABLE')).toBe(true);
    expect(SETTINGS_ERRORS.has('MODEL_DOWNLOAD_FAILED')).toBe(false);
    expect(SETTINGS_ERRORS.has('BUILTIN_NEEDS_DOWNLOAD')).toBe(false);
    expect(new TranslateError('MODEL_DOWNLOAD_FAILED').retryable).toBe(true);
  });
});
