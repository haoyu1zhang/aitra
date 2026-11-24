import { browser } from 'wxt/browser';
import type { CacheStats, RuntimeRequest, RuntimeResponse, TestResult } from './protocol';

type ResponseFor<T extends RuntimeRequest['type']> =
  T extends 'provider:test' ? TestResult
  : T extends 'cache:stats' ? CacheStats
  : T extends 'cache:clear' ? CacheStats
  : never;

export async function sendRuntime<R extends RuntimeRequest>(
  request: R,
): Promise<RuntimeResponse<ResponseFor<R['type']>>> {
  try {
    const res = (await browser.runtime.sendMessage(request)) as
      | RuntimeResponse<ResponseFor<R['type']>>
      | undefined;
    if (!res) {
      return {
        ok: false,
        error: { code: 'UNKNOWN', message: '后台没有响应，请重新加载扩展。', retryable: true },
      };
    }
    return res;
  } catch {
    return {
      ok: false,
      error: { code: 'UNKNOWN', message: '无法连接到扩展后台，请重新加载扩展。', retryable: true },
    };
  }
}
