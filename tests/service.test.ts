import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { TranslateError } from '../lib/errors';
import type { TranslateOptions, TranslationProvider } from '../lib/providers/types';
import { cacheCount } from '../lib/storage/cache';
import { DEFAULT_SETTINGS, type Settings } from '../lib/storage/settings';
import { resolveTarget, translateText } from '../lib/translation/service';

const signal = () => new AbortController().signal;

function fakeProvider(impl: (text: string, o: TranslateOptions) => Promise<{ text: string }>) {
  const translate = vi.fn(impl);
  return { provider: { label: 'fake', translate } as TranslationProvider, translate };
}

describe('translateText', () => {
  beforeEach(() => fakeBrowser.reset());

  it('hits the cache on the second request', async () => {
    const { provider, translate } = fakeProvider(async () => ({ text: '你好' }));
    const first = await translateText('hello', DEFAULT_SETTINGS, { signal: signal(), provider });
    const second = await translateText('hello', DEFAULT_SETTINGS, { signal: signal(), provider });
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.translated).toBe('你好');
    expect(translate).toHaveBeenCalledTimes(1);
    expect(await cacheCount()).toBe(1);
  });

  it('switches to the fallback language for text already in the target', async () => {
    expect(resolveTarget('这是一段中文', DEFAULT_SETTINGS)).toBe('en');
    expect(resolveTarget('plain english', DEFAULT_SETTINGS)).toBe('zh-CN');
    const { provider, translate } = fakeProvider(async () => ({ text: 'Chinese text' }));
    const data = await translateText('这是一段中文', DEFAULT_SETTINGS, { signal: signal(), provider });
    expect(data.targetLang).toBe('en');
    expect(translate.mock.calls[0]?.[1].targetLang).toBe('en');
  });

  it('refuses text over the limit', async () => {
    const { provider } = fakeProvider(async () => ({ text: 'x' }));
    await expect(translateText('a'.repeat(1001), DEFAULT_SETTINGS, { signal: signal(), provider }))
      .rejects.toMatchObject({ code: 'TEXT_TOO_LONG' });
  });

  it('checks permission for custom endpoints', async () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      provider: 'openai',
      openai: { preset: 'custom', baseUrl: 'https://llm.example.com/v1', apiKey: 'k', model: 'm' },
    };
    const { provider, translate } = fakeProvider(async () => ({ text: 'x' }));
    await expect(translateText('hello', settings, { signal: signal(), provider, hasPermission: async () => false }))
      .rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(translate).not.toHaveBeenCalled();
  });

  it('times out instead of loading forever', async () => {
    const { provider } = fakeProvider((_t, o) => new Promise((_resolve, reject) => {
      o.signal.addEventListener('abort', () => reject(o.signal.reason));
    }));
    await expect(translateText('hello', DEFAULT_SETTINGS, {
      signal: signal(),
      provider,
      retries: 0,
      timeouts: { firstResponseMs: 20, totalMs: 50 },
    })).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('keeps waiting while the server shows activity', async () => {
    const { provider } = fakeProvider(async (_t, o) => {
      for (let i = 0; i < 4; i++) {
        await new Promise((r) => setTimeout(r, 15));
        o.onActivity?.();
      }
      o.onChunk?.('好');
      return { text: '好' };
    });
    const data = await translateText('hello', DEFAULT_SETTINGS, {
      signal: signal(),
      provider,
      retries: 0,
      onChunk: () => {},
      timeouts: { firstResponseMs: 30, totalMs: 1000 },
    });
    expect(data.translated).toBe('好');
    expect(data.firstChunkMs).toBeGreaterThanOrEqual(50);
  });

  it('retries a network error and then succeeds', async () => {
    let calls = 0;
    const { provider } = fakeProvider(async () => {
      calls++;
      if (calls === 1) throw new TypeError('Failed to fetch');
      return { text: 'ok' };
    });
    const data = await translateText('hello', DEFAULT_SETTINGS, { signal: signal(), provider });
    expect(data.translated).toBe('ok');
    expect(calls).toBe(2);
  });

  it('does not retry once part of the answer was streamed', async () => {
    let calls = 0;
    const { provider } = fakeProvider(async (_t, o) => {
      calls++;
      o.onChunk?.('部分');
      throw new TranslateError('NETWORK');
    });
    await expect(translateText('hello', DEFAULT_SETTINGS, { signal: signal(), provider, onChunk: () => {} }))
      .rejects.toMatchObject({ code: 'NETWORK' });
    expect(calls).toBe(1);
  });

  it('skips the cache when asked', async () => {
    const { provider, translate } = fakeProvider(async () => ({ text: 'x' }));
    await translateText('hello', DEFAULT_SETTINGS, { signal: signal(), provider, useCache: false });
    await translateText('hello', DEFAULT_SETTINGS, { signal: signal(), provider, useCache: false });
    expect(translate).toHaveBeenCalledTimes(2);
    expect(await cacheCount()).toBe(0);
  });
});
