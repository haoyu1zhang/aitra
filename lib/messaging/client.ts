import { browser } from 'wxt/browser';
import { TranslateError } from '../errors';
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
        error: new TranslateError('UNKNOWN', { key: 'detail.noBackground' }).toInfo(),
      };
    }
    return res;
  } catch {
    return {
      ok: false,
      error: new TranslateError('UNKNOWN', { key: 'detail.noBackground' }).toInfo(),
    };
  }
}
