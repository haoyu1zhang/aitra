import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  DEFAULT_SETTINGS,
  getSettings,
  parseSettings,
  providerCacheKey,
  saveSettings,
  endpointOrigin,
} from '../lib/storage/settings';

describe('settings', () => {
  beforeEach(() => fakeBrowser.reset());

  it('returns defaults when nothing is stored', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back field by field on bad data', () => {
    const parsed = parseSettings({ provider: 'google', targetLang: 'ja', showButton: 'yes', openai: { apiKey: 42 } });
    expect(parsed.provider).toBe('mock');
    expect(parsed.targetLang).toBe('ja');
    expect(parsed.showButton).toBe(true);
    expect(parsed.openai.apiKey).toBe('');
    expect(parsed.openai.baseUrl).toBe(DEFAULT_SETTINGS.openai.baseUrl);
  });

  it('round-trips through storage', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, provider: 'deepl', deepl: { apiKey: 'abc:fx' } });
    const loaded = await getSettings();
    expect(loaded.provider).toBe('deepl');
    expect(loaded.deepl.apiKey).toBe('abc:fx');
  });

  it('separates cache entries by model and endpoint', () => {
    const a = providerCacheKey({ ...DEFAULT_SETTINGS, provider: 'openai' });
    const b = providerCacheKey({
      ...DEFAULT_SETTINGS,
      provider: 'openai',
      openai: { ...DEFAULT_SETTINGS.openai, model: 'other' },
    });
    expect(a).not.toBe(b);
    expect(providerCacheKey(DEFAULT_SETTINGS)).toBe('mock');
  });

  it('parses endpoint origins', () => {
    expect(endpointOrigin('https://api.example.com/v1/')).toBe('https://api.example.com');
    expect(endpointOrigin('ftp://x')).toBeNull();
    expect(endpointOrigin('not a url')).toBeNull();
  });
});
