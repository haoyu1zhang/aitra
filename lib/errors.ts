import { translate, type MessageKey, type Translator } from './i18n';

export const ERROR_CODES = [
  'NOT_CONFIGURED',
  'BUILTIN_UNAVAILABLE',
  'BUILTIN_NEEDS_DOWNLOAD',
  'MODEL_DOWNLOAD_FAILED',
  'NO_API_KEY',
  'INVALID_KEY',
  'RATE_LIMITED',
  'QUOTA_EXCEEDED',
  'TIMEOUT',
  'NETWORK',
  'SERVER_ERROR',
  'PERMISSION_DENIED',
  'BAD_RESPONSE',
  'BAD_CONFIG',
  'TEXT_TOO_LONG',
  'NO_RECEIVER',
  'CANCELLED',
  'UNKNOWN',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface TranslateErrorInfo {
  code: ErrorCode;
  /** English text for logs; the UI translates `code` instead. */
  message: string;
  retryable: boolean;
  /** Extra detail from the provider, shown as-is. */
  detail?: string;
  /** Extra detail of our own, translated by the UI. */
  detailKey?: DetailKey;
}

export type DetailKey = Extract<MessageKey, `detail.${string}`>;

const RETRYABLE: ReadonlySet<ErrorCode> = new Set([
  'MODEL_DOWNLOAD_FAILED',
  'RATE_LIMITED',
  'TIMEOUT',
  'NETWORK',
  'SERVER_ERROR',
]);

export class TranslateError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly detail?: string;
  readonly detailKey?: DetailKey;

  constructor(code: ErrorCode, detail?: string | { key: DetailKey }) {
    super(translate('en', `error.${code}`));
    this.name = 'TranslateError';
    this.code = code;
    this.retryable = RETRYABLE.has(code);
    if (typeof detail === 'string') this.detail = detail;
    else if (detail) this.detailKey = detail.key;
  }

  toInfo(): TranslateErrorInfo {
    const info: TranslateErrorInfo = { code: this.code, message: this.message, retryable: this.retryable };
    if (this.detail) info.detail = this.detail;
    if (this.detailKey) info.detailKey = this.detailKey;
    return info;
  }
}

/** Errors the user fixes on the settings page; the card offers a link there. */
export const SETTINGS_ERRORS: ReadonlySet<ErrorCode> = new Set([
  'NOT_CONFIGURED',
  'BUILTIN_UNAVAILABLE',
  'NO_API_KEY',
  'INVALID_KEY',
  'QUOTA_EXCEEDED',
  'PERMISSION_DENIED',
  'BAD_CONFIG',
]);

/** Builds the user-facing sentence for an error in the current UI language. */
export function describeError(t: Translator, info: Pick<TranslateErrorInfo, 'code' | 'detail' | 'detailKey'>): string {
  const message = t(`error.${info.code}`);
  const detail = info.detailKey ? t(info.detailKey) : info.detail;
  return detail ? t('error.withDetail', { message, detail }) : message;
}

export function errorFromStatus(status: number, detail?: string): TranslateError {
  if (status === 401 || status === 403) return new TranslateError('INVALID_KEY', detail);
  if (status === 402 || status === 456) return new TranslateError('QUOTA_EXCEEDED', detail);
  if (status === 429) return new TranslateError('RATE_LIMITED', detail);
  if (status === 404) return new TranslateError('BAD_CONFIG', detail ?? `HTTP ${status}`);
  if (status >= 500) return new TranslateError('SERVER_ERROR', `HTTP ${status}`);
  if (status === 400 || status === 422) return new TranslateError('BAD_CONFIG', detail ?? `HTTP ${status}`);
  return new TranslateError('UNKNOWN', `HTTP ${status}`);
}

/** Turns anything thrown during a request into a TranslateError. */
export function normalizeError(err: unknown): TranslateError {
  if (err instanceof TranslateError) return err;
  if (err instanceof DOMException && err.name === 'AbortError') {
    return new TranslateError('CANCELLED');
  }
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return new TranslateError('TIMEOUT');
  }
  // fetch() rejects with a TypeError for DNS, CORS and connection failures.
  if (err instanceof TypeError) return new TranslateError('NETWORK');
  return new TranslateError('UNKNOWN');
}
