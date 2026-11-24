import { z } from '../zod';
import { browser } from 'wxt/browser';
import { LANG_CODES } from '../languages';
import { UI_LANG_SETTINGS } from '../i18n';

export const PROVIDER_IDS = ['openai', 'deepl'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** Starting points for the "add API" form. */
export const API_TEMPLATES = {
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
  custom: { label: 'Custom', baseUrl: '', model: '' },
} as const;
export type ApiTemplate = keyof typeof API_TEMPLATES;

export const apiProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim(),
  baseUrl: z.string().trim(),
  apiKey: z.string().trim(),
  model: z.string().trim(),
});
export type ApiProfile = z.infer<typeof apiProfileSchema>;

const deeplSchema = z.object({
  apiKey: z.string().trim().catch(''),
});

// Invalid entries are dropped one by one instead of wiping the whole list.
const apisSchema = z
  .array(z.unknown())
  .catch([])
  .transform((items) =>
    items.flatMap((item) => {
      const parsed = apiProfileSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }),
  );

export const settingsSchema = z.object({
  // Older versions had a 'mock' provider; anything unknown lands on the AI API.
  provider: z.enum(PROVIDER_IDS).catch('openai'),
  targetLang: z.enum(LANG_CODES).catch('zh-CN'),
  // Used when the selection is already in the target language.
  fallbackLang: z.enum(LANG_CODES).catch('en'),
  showButton: z.boolean().catch(true),
  uiLang: z.enum(UI_LANG_SETTINGS).catch('auto'),
  apis: apisSchema,
  activeApiId: z.string().nullable().catch(null),
  deepl: deeplSchema.catch({ apiKey: '' }),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  provider: 'openai',
  targetLang: 'zh-CN',
  fallbackLang: 'en',
  showButton: true,
  uiLang: 'auto',
  apis: [],
  activeApiId: null,
  deepl: { apiKey: '' },
};

const KEY = 'settings';

export function newApiId(): string {
  return `api_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 0.1.x stored a single endpoint under `openai`; turn it into a saved API. */
function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(raw.apis) || !raw.openai || typeof raw.openai !== 'object') return raw;
  const old = raw.openai as Record<string, unknown>;
  const apiKey = typeof old.apiKey === 'string' ? old.apiKey.trim() : '';
  const baseUrl = typeof old.baseUrl === 'string' ? old.baseUrl.trim() : '';
  const model = typeof old.model === 'string' ? old.model.trim() : '';
  const { openai: _drop, ...rest } = raw;
  if (!apiKey || !baseUrl) return rest;
  const id = newApiId();
  const host = endpointOrigin(baseUrl)?.replace(/^https?:\/\//, '') ?? 'API';
  return { ...rest, apis: [{ id, name: host, baseUrl, apiKey, model }], activeApiId: id };
}

/** Parses anything into valid settings, falling back field by field. */
export function parseSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_SETTINGS);
  const merged = { ...DEFAULT_SETTINGS, ...migrate(raw as Record<string, unknown>) };
  const parsed = settingsSchema.parse(merged);
  if (parsed.activeApiId && !parsed.apis.some((a) => a.id === parsed.activeApiId)) {
    parsed.activeApiId = parsed.apis[0]?.id ?? null;
  }
  return parsed;
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

/** True once the selected service has what it needs to make a request. */
export function isConfigured(settings: Settings): boolean {
  if (settings.provider === 'deepl') return settings.deepl.apiKey.length > 0;
  const api = activeApi(settings);
  return Boolean(api && api.apiKey && api.model && endpointOrigin(api.baseUrl));
}

export function activeApi(settings: Settings): ApiProfile | null {
  return settings.apis.find((a) => a.id === settings.activeApiId) ?? settings.apis[0] ?? null;
}

/** Origin of an OpenAI-compatible endpoint, or null if invalid. */
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
      const api = activeApi(settings);
      if (!api) return 'openai:none';
      return `openai:${api.model}@${endpointOrigin(api.baseUrl) ?? 'invalid'}`;
    }
    case 'deepl':
      return 'deepl';
  }
}

export function apiLabel(api: ApiProfile): string {
  const name = api.name || endpointOrigin(api.baseUrl)?.replace(/^https?:\/\//, '') || 'API';
  return api.model ? `${name} · ${api.model}` : name;
}

export function providerLabel(settings: Settings): string {
  switch (settings.provider) {
    case 'deepl':
      return 'DeepL';
    case 'openai': {
      const api = activeApi(settings);
      return api ? apiLabel(api) : '';
    }
  }
}
