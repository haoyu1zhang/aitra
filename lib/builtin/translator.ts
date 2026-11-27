import { TranslateError } from '../errors';
import { guessLanguage, sameLanguage } from '../languages';
import type { TranslateData } from '../messaging/protocol';
import type { Settings } from '../storage/settings';

/**
 * Chrome's on-device Translator API. It only exists in documents (pages,
 * content scripts, extension pages), not in the background service worker,
 * so this runs wherever the request starts.
 */

export type BuiltinStatus = AIAvailability | 'unsupported';

export interface BuiltinApis {
  translator?: typeof Translator;
  detector?: typeof LanguageDetector;
}

function globals(): BuiltinApis {
  return {
    translator: typeof Translator === 'undefined' ? undefined : Translator,
    detector: typeof LanguageDetector === 'undefined' ? undefined : LanguageDetector,
  };
}

/** Our language codes to the BCP 47 tags the Translator API expects. */
export function toBuiltinLang(code: string): string {
  if (code === 'zh-CN' || code === 'zh') return 'zh';
  if (code === 'zh-TW') return 'zh-Hant';
  return code.split('-')[0]!;
}

export async function builtinStatus(
  targetLang: string,
  sourceLang = 'en',
  apis: BuiltinApis = globals(),
): Promise<BuiltinStatus> {
  if (!apis.translator) return 'unsupported';
  try {
    return await apis.translator.availability({
      sourceLanguage: toBuiltinLang(sourceLang),
      targetLanguage: toBuiltinLang(targetLang),
    });
  } catch {
    return 'unavailable';
  }
}

let detector: Promise<LanguageDetector> | null = null;

/**
 * Script-based guess first (cheap and reliable for CJK and Cyrillic), then
 * the built-in language detector if its model is already on the device.
 * Falls back to English, the most common source by far.
 */
export async function detectSource(text: string, apis: BuiltinApis = globals()): Promise<string> {
  const guess = guessLanguage(text);
  if (guess) return guess;
  const api = apis.detector;
  if (!api) return 'en';
  try {
    if ((await api.availability()) !== 'available') return 'en';
    detector ??= api.create();
    const [top] = await (await detector).detect(text);
    if (top && top.detectedLanguage !== 'und' && top.confidence >= 0.5) {
      return top.detectedLanguage.split('-')[0]!;
    }
  } catch {
    detector = null;
  }
  return 'en';
}

interface PendingTranslator {
  promise: Promise<Translator>;
  /** Everyone waiting on this model hears about download progress. */
  listeners: Set<(fraction: number) => void>;
}

const translators = new Map<string, PendingTranslator>();

/**
 * Chrome's create() never settles if the model download can't get going
 * (offline, blocked network). Give up when nothing has moved for this long.
 */
const DOWNLOAD_STALL_MS = 20_000;

export interface BuiltinOptions {
  signal?: AbortSignal;
  /** Download progress between 0 and 1 while a language model is fetched. */
  onDownload?: (fraction: number) => void;
  apis?: BuiltinApis;
  stallMs?: number;
}

function createTranslator(
  api: NonNullable<BuiltinApis['translator']>,
  languages: TranslatorLanguages,
  key: string,
  stallMs: number,
  first?: (fraction: number) => void,
): PendingTranslator {
  // Registered before create() so no early progress event is missed.
  const listeners = new Set<(fraction: number) => void>(first ? [first] : []);
  const promise = new Promise<Translator>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        translators.delete(key);
        reject(new TranslateError('MODEL_DOWNLOAD_FAILED'));
      }, stallMs);
    };
    arm();
    api
      .create({
        ...languages,
        monitor(m) {
          m.addEventListener('downloadprogress', (e) => {
            arm();
            listeners.forEach((fn) => fn(e.loaded));
          });
        },
      })
      .then(resolve, reject)
      .finally(() => clearTimeout(timer));
  });
  return { promise, listeners };
}

export async function translateWithBuiltin(
  rawText: string,
  settings: Pick<Settings, 'targetLang' | 'fallbackLang'>,
  options: BuiltinOptions = {},
): Promise<TranslateData> {
  const started = Date.now();
  const apis = options.apis ?? globals();
  const text = rawText.trim();
  if (!apis.translator) throw new TranslateError('BUILTIN_UNAVAILABLE', { key: 'detail.builtinUnsupported' });

  const source = await detectSource(text, apis);
  const target = sameLanguage(source, settings.targetLang) ? settings.fallbackLang : settings.targetLang;
  const languages = { sourceLanguage: toBuiltinLang(source), targetLanguage: toBuiltinLang(target) };

  const status = await builtinStatus(target, source, apis);
  if (status === 'unavailable' || status === 'unsupported') {
    throw new TranslateError('BUILTIN_UNAVAILABLE', { key: 'detail.builtinPair' });
  }

  const key = `${languages.sourceLanguage}>${languages.targetLanguage}`;
  const listener = options.onDownload;
  let pending = translators.get(key);
  if (!pending) {
    pending = createTranslator(apis.translator, languages, key, options.stallMs ?? DOWNLOAD_STALL_MS, listener);
    translators.set(key, pending);
  } else if (listener) {
    pending.listeners.add(listener);
  }

  let translator: Translator;
  try {
    translator = await pending.promise;
  } catch (err) {
    translators.delete(key);
    if (err instanceof TranslateError) throw err;
    // Downloading a model needs a click; a keyboard shortcut doesn't count.
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      throw new TranslateError('BUILTIN_NEEDS_DOWNLOAD');
    }
    throw new TranslateError('BUILTIN_UNAVAILABLE', { key: 'detail.builtinPair' });
  } finally {
    if (listener) pending.listeners.delete(listener);
  }

  let translated: string;
  try {
    translated = await translator.translate(text, { signal: options.signal });
  } catch (err) {
    if (options.signal?.aborted) throw new TranslateError('CANCELLED');
    if (err instanceof DOMException && err.name === 'AbortError') throw new TranslateError('CANCELLED');
    throw new TranslateError('UNKNOWN', err instanceof Error ? err.name : undefined);
  }

  if (!translated.trim()) throw new TranslateError('BAD_RESPONSE', { key: 'detail.emptyReply' });
  return {
    source: text,
    translated: translated.trim(),
    targetLang: target,
    detectedSourceLang: source,
    provider: 'builtin',
    cached: false,
    elapsedMs: Date.now() - started,
  };
}

/**
 * The language pair worth fetching ahead of time: English into the target,
 * or, when the target is English, the browser's own language into English.
 */
export function preloadPair(targetLang: string, browserLocale = globalThis.navigator?.language): TranslatorLanguages | null {
  const target = toBuiltinLang(targetLang);
  if (target !== 'en') return { sourceLanguage: 'en', targetLanguage: target };
  const source = toBuiltinLang(browserLocale ?? '');
  return source && source !== 'en' ? { sourceLanguage: source, targetLanguage: 'en' } : null;
}

/** True when a model still has to be downloaded before the first translation. */
export async function needsPreload(targetLang: string, apis: BuiltinApis = globals()): Promise<boolean> {
  const pair = preloadPair(targetLang);
  if (!apis.translator || !pair) return false;
  try {
    const translatorState = await apis.translator.availability(pair);
    const detectorState = apis.detector ? await apis.detector.availability() : 'unavailable';
    return translatorState === 'downloadable' || detectorState === 'downloadable';
  } catch {
    return false;
  }
}

/**
 * Starts the model downloads. Chrome only allows this right after a click or
 * key press, so call it synchronously from such an event. The translator is
 * kept, so the first real translation picks it up (and its progress).
 */
export function preloadBuiltin(
  targetLang: string,
  apis: BuiltinApis = globals(),
  stallMs = DOWNLOAD_STALL_MS,
): Promise<void> {
  const pair = preloadPair(targetLang);
  if (!apis.translator || !pair) return Promise.resolve();
  const key = `${pair.sourceLanguage}>${pair.targetLanguage}`;
  let pending = translators.get(key);
  if (!pending) {
    pending = createTranslator(apis.translator, pair, key, stallMs);
    translators.set(key, pending);
  }
  const work: Promise<unknown>[] = [pending.promise];
  if (apis.detector && !detector) {
    detector = apis.detector.create();
    work.push(detector);
  }
  return Promise.allSettled(work).then((results) => {
    if (results[0]?.status === 'rejected') translators.delete(key);
    if (results[1]?.status === 'rejected') detector = null;
  });
}

/** Lets tests start from a clean slate. */
export function resetBuiltinCache() {
  translators.clear();
  detector = null;
}
