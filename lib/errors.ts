export const ERROR_CODES = [
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
  message: string;
  retryable: boolean;
}

const RETRYABLE: ReadonlySet<ErrorCode> = new Set([
  'RATE_LIMITED',
  'TIMEOUT',
  'NETWORK',
  'SERVER_ERROR',
]);

const MESSAGES: Record<ErrorCode, string> = {
  NO_API_KEY: '还没有填写 API Key，请到设置页配置。',
  INVALID_KEY: 'API Key 无效或没有权限，请检查设置。',
  RATE_LIMITED: '请求太频繁，被服务方限流了，稍后再试。',
  QUOTA_EXCEEDED: '额度已用完，请检查账户余额或套餐。',
  TIMEOUT: '请求超时，服务方没有及时响应。',
  NETWORK: '网络连接失败，请检查网络或接口地址。',
  SERVER_ERROR: '翻译服务暂时出错，稍后再试。',
  PERMISSION_DENIED: '还没有授权访问这个接口地址，请到设置页保存一次并允许授权。',
  BAD_RESPONSE: '服务返回的数据无法识别。',
  BAD_CONFIG: '接口配置不完整，请检查接口地址和模型名称。',
  TEXT_TOO_LONG: '选中的文本太长了（最多 1000 个字符）。',
  NO_RECEIVER: '当前页面无法使用划词翻译，刷新页面后再试。',
  CANCELLED: '已取消。',
  UNKNOWN: '翻译失败，原因未知。',
};

export class TranslateError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  /** Extra detail from the provider, shown under the main message. */
  readonly detail?: string;

  constructor(code: ErrorCode, detail?: string) {
    super(MESSAGES[code]);
    this.name = 'TranslateError';
    this.code = code;
    this.retryable = RETRYABLE.has(code);
    this.detail = detail;
  }

  toInfo(): TranslateErrorInfo {
    const message = this.detail ? `${this.message}（${this.detail}）` : this.message;
    return { code: this.code, message, retryable: this.retryable };
  }
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

export function messageFor(code: ErrorCode): string {
  return MESSAGES[code];
}
