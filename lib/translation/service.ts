import { TranslateError, normalizeError } from '../errors';
import { guessLanguage, sameLanguage } from '../languages';
import { MAX_TEXT_LENGTH, type TranslateData } from '../messaging/protocol';
import { createProvider } from '../providers/registry';
import type { TranslationProvider } from '../providers/types';
import { cacheKey, getCached, putCached } from '../storage/cache';
import { providerCacheKey, providerLabel, type Settings } from '../storage/settings';
import { createDeadline } from './timeout';
import { withRetry } from './retry';

export interface TranslateRequestOptions {
  signal: AbortSignal;
  onChunk?: (delta: string) => void;
  useCache?: boolean;
  /** Checked before talking to an endpoint outside the built-in host list. */
  hasPermission?: (settings: Settings) => Promise<boolean>;
  provider?: TranslationProvider;
  timeouts?: { firstResponseMs: number; totalMs: number };
  retries?: number;
}

const DEFAULT_TIMEOUTS = { firstResponseMs: 12_000, totalMs: 30_000 };

/** Picks the language to translate into, switching to the fallback when the text is already in the target. */
export function resolveTarget(text: string, settings: Settings): string {
  return sameLanguage(guessLanguage(text), settings.targetLang) ? settings.fallbackLang : settings.targetLang;
}

export async function translateText(
  rawText: string,
  settings: Settings,
  options: TranslateRequestOptions,
): Promise<TranslateData> {
  const started = Date.now();
  const text = rawText.trim();
  if (!text) throw new TranslateError('BAD_RESPONSE', '没有要翻译的文本');
  if (text.length > MAX_TEXT_LENGTH) throw new TranslateError('TEXT_TOO_LONG');

  const targetLang = resolveTarget(text, settings);
  const label = providerLabel(settings);
  const useCache = options.useCache ?? true;
  const hash = await cacheKey({ text, targetLang, provider: providerCacheKey(settings) });

  if (useCache) {
    const hit = await getCached(hash);
    if (hit) {
      return {
        source: text,
        translated: hit.translated,
        targetLang,
        detectedSourceLang: hit.detectedSourceLang,
        provider: label,
        cached: true,
        elapsedMs: Date.now() - started,
      };
    }
  }

  if (settings.provider === 'openai' && options.hasPermission && !(await options.hasPermission(settings))) {
    throw new TranslateError('PERMISSION_DENIED');
  }

  const provider = options.provider ?? createProvider(settings);
  const timeouts = options.timeouts ?? DEFAULT_TIMEOUTS;
  let streamed = false;

  const result = await withRetry(
    async () => {
      const deadline = createDeadline(options.signal, timeouts);
      try {
        return await provider.translate(text, {
          targetLang,
          signal: deadline.signal,
          onChunk: options.onChunk
            ? (delta) => {
                deadline.progress();
                streamed = true;
                options.onChunk!(delta);
              }
            : undefined,
        });
      } catch (err) {
        // fetch rejects with the abort reason, but be defensive about it.
        if (deadline.signal.aborted && deadline.signal.reason instanceof TranslateError) {
          throw deadline.signal.reason;
        }
        throw normalizeError(err);
      } finally {
        deadline.dispose();
      }
    },
    {
      retries: options.retries ?? 1,
      baseDelayMs: 600,
      signal: options.signal,
      // Once text is on screen a retry would duplicate it.
      canRetry: () => !streamed,
    },
  );

  if (useCache) {
    await putCached(hash, {
      translated: result.text,
      detectedSourceLang: result.detectedSourceLang,
      targetLang,
      createdAt: Date.now(),
    });
  }

  return {
    source: text,
    translated: result.text,
    targetLang,
    detectedSourceLang: result.detectedSourceLang,
    provider: label,
    cached: false,
    elapsedMs: Date.now() - started,
  };
}
