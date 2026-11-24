import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { cacheCount, cacheKey, clearCache, getCached, putCached } from '../lib/storage/cache';

const entry = (translated: string) => ({ translated, targetLang: 'zh-CN', createdAt: Date.now() });

describe('cache', () => {
  beforeEach(() => fakeBrowser.reset());

  it('hashes text, language, provider and glossary version', async () => {
    const base = { text: 'hello', targetLang: 'zh-CN', provider: 'mock' };
    const key = await cacheKey(base);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(await cacheKey(base)).toBe(key);
    expect(await cacheKey({ ...base, targetLang: 'ja' })).not.toBe(key);
    expect(await cacheKey({ ...base, provider: 'deepl' })).not.toBe(key);
    expect(await cacheKey({ ...base, glossaryVersion: 1 })).not.toBe(key);
  });

  it('stores and reads entries', async () => {
    await putCached('h1', entry('你好'));
    expect((await getCached('h1'))?.translated).toBe('你好');
    expect(await getCached('missing')).toBeNull();
    expect(await cacheCount()).toBe(1);
  });

  it('drops the oldest entries past the limit', async () => {
    for (const h of ['a', 'b', 'c', 'd']) await putCached(h, entry(h), 3);
    expect(await cacheCount()).toBe(3);
    expect(await getCached('a')).toBeNull();
    expect(await getCached('d')).not.toBeNull();
  });

  it('keeps every write when puts overlap', async () => {
    await Promise.all(['a', 'b', 'c', 'd', 'e'].map((h) => putCached(h, entry(h))));
    expect(await cacheCount()).toBe(5);
  });

  it('clears everything', async () => {
    await putCached('a', entry('a'));
    await fakeBrowser.storage.local.set({ settings: { provider: 'mock' } });
    await clearCache();
    expect(await cacheCount()).toBe(0);
    expect(await getCached('a')).toBeNull();
    const rest = await fakeBrowser.storage.local.get('settings');
    expect(rest.settings).toBeDefined();
  });
});
