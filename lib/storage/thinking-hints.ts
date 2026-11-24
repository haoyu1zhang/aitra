import { z } from '../zod';
import { browser } from 'wxt/browser';
import { THINKING_VARIANTS, type ThinkingVariant } from '../providers/thinking';

const KEY = 'thinkingHints';
const variantSchema = z.enum(Object.keys(THINKING_VARIANTS) as [ThinkingVariant, ...ThinkingVariant[]]);
const hintsSchema = z.record(z.string(), z.unknown()).catch({});

export interface ThinkingHintStore {
  get(key: string): Promise<ThinkingVariant | undefined>;
  set(key: string, variant: ThinkingVariant): Promise<void>;
}

export function hintKey(baseUrl: string, model: string): string {
  return `${baseUrl.trim().replace(/\/+$/, '')}|${model}`;
}

export const storageHints: ThinkingHintStore = {
  async get(key) {
    const stored = await browser.storage.local.get(KEY);
    const parsed = variantSchema.safeParse(hintsSchema.parse(stored[KEY])[key]);
    return parsed.success ? parsed.data : undefined;
  },
  async set(key, variant) {
    const stored = await browser.storage.local.get(KEY);
    const hints = hintsSchema.parse(stored[KEY]);
    if (hints[key] === variant) return;
    await browser.storage.local.set({ [KEY]: { ...hints, [key]: variant } });
  },
};

export function memoryHints(): ThinkingHintStore {
  const map = new Map<string, ThinkingVariant>();
  return {
    get: async (key) => map.get(key),
    set: async (key, variant) => void map.set(key, variant),
  };
}
