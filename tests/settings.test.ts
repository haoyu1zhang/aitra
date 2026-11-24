import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  DEFAULT_SETTINGS,
  getSettings,
  parseSettings,
  providerCacheKey,
  saveSettings,
  endpointOrigin,
  activeApi,
  isConfigured,
} from '../lib/storage/settings';

describe('settings', () => {
  beforeEach(() => fakeBrowser.reset());

  it('returns defaults when nothing is stored', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back field by field on bad data', () => {
    const parsed = parseSettings({ provider: 'google', targetLang: 'ja', showButton: 'yes', openai: { apiKey: 42 } });
    expect(parsed.provider).toBe('openai');
    expect(parsed.targetLang).toBe('ja');
    expect(parsed.showButton).toBe(true);
    expect(parsed.apis).toEqual([]);
  });

  it('drops broken API entries and fixes a dangling active id', () => {
    const good = { id: 'a1', name: 'A', baseUrl: 'https://x.dev/v1', apiKey: 'k', model: 'm' };
    const parsed = parseSettings({ apis: [good, { id: 5 }, 'junk'], activeApiId: 'gone' });
    expect(parsed.apis).toEqual([good]);
    expect(parsed.activeApiId).toBe('a1');
  });

  it('migrates the old single endpoint into a saved API', () => {
    const parsed = parseSettings({
      provider: 'openai',
      openai: { preset: 'custom', baseUrl: 'https://api.gitapihub.win/v1', apiKey: 'sk-1', model: 'deepseek-flash' },
    });
    expect(parsed.apis).toHaveLength(1);
    expect(parsed.apis[0]).toMatchObject({ name: 'api.gitapihub.win', apiKey: 'sk-1', model: 'deepseek-flash' });
    expect(parsed.activeApiId).toBe(parsed.apis[0]!.id);
    expect(activeApi(parsed)?.baseUrl).toBe('https://api.gitapihub.win/v1');
  });

  it('round-trips through storage', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, provider: 'deepl', deepl: { apiKey: 'abc:fx' } });
    const loaded = await getSettings();
    expect(loaded.provider).toBe('deepl');
    expect(loaded.deepl.apiKey).toBe('abc:fx');
  });

  it('separates cache entries by model and endpoint', () => {
    const api = { id: 'a', name: 'A', baseUrl: 'https://x.dev/v1', apiKey: 'k', model: 'm1' };
    const a = providerCacheKey({ ...DEFAULT_SETTINGS, provider: 'openai', apis: [api], activeApiId: 'a' });
    const b = providerCacheKey({
      ...DEFAULT_SETTINGS,
      provider: 'openai',
      apis: [{ ...api, model: 'm2' }],
      activeApiId: 'a',
    });
    expect(a).not.toBe(b);
    expect(providerCacheKey({ ...DEFAULT_SETTINGS, provider: 'deepl' })).toBe('deepl');
  });

  it('moves the removed mock provider to the AI API', () => {
    expect(parseSettings({ provider: 'mock' }).provider).toBe('openai');
  });

  it('knows when a service is ready to use', () => {
    expect(isConfigured(DEFAULT_SETTINGS)).toBe(false);
    const api = { id: 'a', name: 'A', baseUrl: 'https://api.deepseek.com', apiKey: 'sk-1', model: 'deepseek-flash' };
    expect(isConfigured({ ...DEFAULT_SETTINGS, apis: [api], activeApiId: 'a' })).toBe(true);
    expect(isConfigured({ ...DEFAULT_SETTINGS, apis: [{ ...api, apiKey: '' }], activeApiId: 'a' })).toBe(false);
    expect(isConfigured({ ...DEFAULT_SETTINGS, provider: 'deepl' })).toBe(false);
    expect(isConfigured({ ...DEFAULT_SETTINGS, provider: 'deepl', deepl: { apiKey: 'x:fx' } })).toBe(true);
  });

  it('parses endpoint origins', () => {
    expect(endpointOrigin('https://api.example.com/v1/')).toBe('https://api.example.com');
    expect(endpointOrigin('ftp://x')).toBeNull();
    expect(endpointOrigin('not a url')).toBeNull();
  });
});
