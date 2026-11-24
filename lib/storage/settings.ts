import { z } from '../zod';
import { browser } from 'wxt/browser';
import { LANG_CODES } from '../languages';

export const PROVIDER_IDS = ['mock', 'openai', 'deepl'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const OPENAI_PRESETS = {
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
  custom: { label: '自定义', baseUrl: '', model: '' },
} as const;
export type OpenAIPreset = keyof typeof OPENAI_PRESETS;

const openaiSchema = z.object({
  preset: z.enum(['deepseek', 'openai', 'custom']).catch('deepseek'),
  baseUrl: z.string().trim().catch(OPENAI_PRESETS.deepseek.baseUrl),
  apiKey: z.string().trim().catch(''),
  model: z.string().trim().catch(OPENAI_PRESETS.deepseek.model),
});

const deeplSchema = z.object({
  apiKey: z.string().trim().catch(''),
});

export const settingsSchema = z.object({
  provider: z.enum(PROVIDER_IDS).catch('mock'),
  targetLang: z.enum(LANG_CODES).catch('zh-CN'),
  // Used when the selection is already in the target language.
  fallbackLang: z.enum(LANG_CODES).catch('en'),
  showButton: z.boolean().catch(true),
  openai: openaiSchema.catch({
    preset: 'deepseek',
    baseUrl: OPENAI_PRESETS.deepseek.baseUrl,
    apiKey: '',
    model: OPENAI_PRESETS.deepseek.model,
  }),
  deepl: deeplSchema.catch({ apiKey: '' }),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  provider: 'mock',
  targetLang: 'zh-CN',
  fallbackLang: 'en',
  showButton: true,
  openai: {
    preset: 'deepseek',
    baseUrl: OPENAI_PRESETS.deepseek.baseUrl,
    apiKey: '',
    model: OPENAI_PRESETS.deepseek.model,
  },
  deepl: { apiKey: '' },
};

const KEY = 'settings';

/** Parses anything into valid settings, falling back field by field. */
export function parseSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_SETTINGS);
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(raw as Record<string, unknown>),
  };
  return settingsSchema.parse(merged);
}

export async function getSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(KEY);
  return parseSettings(stored[KEY]);
}

export async function saveSettings(next: Settings): Promise<Settings> {
  const valid = settingsSchema.parse(next);
  await browser.storage.local.set({ [KEY]: valid });
  return valid;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  return saveSettings({ ...current, ...patch });
}

export function watchSettings(callback: (settings: Settings) => void): () => void {
  const listener = (
    changes: Record<string, { newValue?: unknown }>,
    area: string,
  ) => {
    if (area !== 'local' || !(KEY in changes)) return;
    callback(parseSettings(changes[KEY]?.newValue));
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

/** Origin of the configured OpenAI-compatible endpoint, or null if invalid. */
export function endpointOrigin(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Key used to separate cache entries per provider/model/endpoint. */
export function providerCacheKey(settings: Settings): string {
  switch (settings.provider) {
    case 'openai': {
      const host = endpointOrigin(settings.openai.baseUrl) ?? 'invalid';
      return `openai:${settings.openai.model}@${host}`;
    }
    case 'deepl':
      return 'deepl';
    case 'mock':
      return 'mock';
  }
}

export function providerLabel(settings: Settings): string {
  switch (settings.provider) {
    case 'mock':
      return 'Mock（本地模拟）';
    case 'deepl':
      return 'DeepL';
    case 'openai': {
      const preset = OPENAI_PRESETS[settings.openai.preset];
      const name = settings.openai.preset === 'custom'
        ? endpointOrigin(settings.openai.baseUrl) ?? '自定义接口'
        : preset.label;
      return settings.openai.model ? `${name} · ${settings.openai.model}` : name;
    }
  }
}
