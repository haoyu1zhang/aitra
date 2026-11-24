import { z } from '../zod';
import { browser } from 'wxt/browser';

export const CACHE_MAX = 500;
export const GLOSSARY_VERSION = 0;

const INDEX_KEY = 'cacheIndex';
const ENTRY_PREFIX = 'cache:';

const entrySchema = z.object({
  translated: z.string(),
  detectedSourceLang: z.string().optional(),
  targetLang: z.string(),
  createdAt: z.number(),
});
export type CacheEntry = z.infer<typeof entrySchema>;

const indexSchema = z.array(z.string()).catch([]);

export interface CacheKeyParts {
  text: string;
  targetLang: string;
  provider: string;
  glossaryVersion?: number;
}

export async function cacheKey(parts: CacheKeyParts): Promise<string> {
  const raw = [parts.text, parts.targetLang, parts.provider, parts.glossaryVersion ?? GLOSSARY_VERSION].join('\u0000');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Writes go through one queue so two translations finishing at the same time
// can't overwrite each other's index update.
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

async function readIndex(): Promise<string[]> {
  const stored = await browser.storage.local.get(INDEX_KEY);
  return indexSchema.parse(stored[INDEX_KEY]);
}

export async function getCached(hash: string): Promise<CacheEntry | null> {
  const key = ENTRY_PREFIX + hash;
  const stored = await browser.storage.local.get(key);
  const parsed = entrySchema.safeParse(stored[key]);
  return parsed.success ? parsed.data : null;
}

export function putCached(hash: string, entry: CacheEntry, max = CACHE_MAX): Promise<void> {
  return serialize(async () => {
    const index = (await readIndex()).filter((h) => h !== hash);
    index.push(hash);
    const evicted = index.length > max ? index.splice(0, index.length - max) : [];
    if (evicted.length) {
      await browser.storage.local.remove(evicted.map((h) => ENTRY_PREFIX + h));
    }
    await browser.storage.local.set({ [ENTRY_PREFIX + hash]: entry, [INDEX_KEY]: index });
  });
}

export async function cacheCount(): Promise<number> {
  return (await readIndex()).length;
}

export function clearCache(): Promise<void> {
  return serialize(async () => {
    const all = await browser.storage.local.get(null);
    const keys = Object.keys(all).filter((k) => k.startsWith(ENTRY_PREFIX));
    await browser.storage.local.remove([...keys, INDEX_KEY]);
  });
}
