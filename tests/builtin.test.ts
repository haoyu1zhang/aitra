import { beforeEach, describe, expect, it, vi } from 'vitest';
import { builtinStatus, resetBuiltinCache, toBuiltinLang, translateWithBuiltin } from '../lib/builtin/translator';

const settings = { targetLang: 'zh-CN' as const, fallbackLang: 'en' as const };

function fakeApis(opts: {
  availability?: AIAvailability;
  detected?: string;
  createError?: string;
  output?: (text: string, pair: string) => string;
} = {}) {
  const created: string[] = [];
  const translator = {
    availability: vi.fn(async () => opts.availability ?? 'available'),
    create: vi.fn(async (o: TranslatorLanguages & AICreateOptions) => {
      const pair = `${o.sourceLanguage}>${o.targetLanguage}`;
      if (opts.createError) throw new DOMException('nope', opts.createError);
      const monitor = new EventTarget();
      o.monitor?.(monitor as AICreateMonitor);
      const progress = Object.assign(new Event('downloadprogress'), { loaded: 1 });
      monitor.dispatchEvent(progress);
      created.push(pair);
      return {
        translate: async (text: string) => (opts.output ?? ((t, p) => `[${p}] ${t}`))(text, pair),
        destroy: () => {},
      };
    }),
  };
  const detector = opts.detected
    ? {
        availability: async () => 'available' as const,
        create: async () => ({
          detect: async () => [{ detectedLanguage: opts.detected!, confidence: 0.9 }],
          destroy: () => {},
        }),
      }
    : undefined;
  return { apis: { translator, detector }, translator, created };
}

describe('built-in translator', () => {
  beforeEach(() => resetBuiltinCache());

  it('maps language codes', () => {
    expect(toBuiltinLang('zh-CN')).toBe('zh');
    expect(toBuiltinLang('zh-TW')).toBe('zh-Hant');
    expect(toBuiltinLang('ja')).toBe('ja');
  });

  it('reports when the browser has no Translator API', async () => {
    expect(await builtinStatus('zh-CN', 'en', {})).toBe('unsupported');
    await expect(translateWithBuiltin('hello', settings, { apis: {} }))
      .rejects.toMatchObject({ code: 'BUILTIN_UNAVAILABLE', detailKey: 'detail.builtinUnsupported' });
  });

  it('translates English to the target and reuses the translator', async () => {
    const { apis, translator } = fakeApis();
    const first = await translateWithBuiltin('hello world', settings, { apis });
    expect(first).toMatchObject({ translated: '[en>zh] hello world', provider: 'builtin', targetLang: 'zh-CN', detectedSourceLang: 'en' });
    await translateWithBuiltin('another sentence', settings, { apis });
    expect(translator.create).toHaveBeenCalledTimes(1);
  });

  it('switches to the fallback language for text already in the target', async () => {
    const { apis, created } = fakeApis();
    const data = await translateWithBuiltin('这是一段中文', settings, { apis });
    expect(created).toEqual(['zh>en']);
    expect(data.targetLang).toBe('en');
  });

  it('uses the language detector for Latin scripts', async () => {
    const { apis, created } = fakeApis({ detected: 'fr' });
    await translateWithBuiltin('Bonjour tout le monde', settings, { apis });
    expect(created).toEqual(['fr>zh']);
  });

  it('reports unsupported language pairs', async () => {
    const { apis } = fakeApis({ availability: 'unavailable' });
    await expect(translateWithBuiltin('hello', settings, { apis }))
      .rejects.toMatchObject({ code: 'BUILTIN_UNAVAILABLE', detailKey: 'detail.builtinPair' });
  });

  it('asks for a click when the model has to be downloaded', async () => {
    const { apis } = fakeApis({ availability: 'downloadable', createError: 'NotAllowedError' });
    await expect(translateWithBuiltin('hello', settings, { apis }))
      .rejects.toMatchObject({ code: 'BUILTIN_NEEDS_DOWNLOAD' });
  });

  it('reports download progress', async () => {
    const { apis } = fakeApis({ availability: 'downloadable' });
    const progress: number[] = [];
    await translateWithBuiltin('hello', settings, { apis, onDownload: (f) => progress.push(f) });
    expect(progress).toEqual([1]);
  });
});

describe('built-in translator downloads', () => {
  beforeEach(() => resetBuiltinCache());

  it('gives up when the model download never moves', async () => {
    const translator = {
      availability: async () => 'downloadable' as const,
      create: () => new Promise<never>(() => {}),
    };
    await expect(translateWithBuiltin('hello', settings, { apis: { translator }, stallMs: 30 }))
      .rejects.toMatchObject({ code: 'MODEL_DOWNLOAD_FAILED' });
  });

  it('keeps waiting while progress comes in and shares it with later callers', async () => {
    let finish: (() => void) | undefined;
    const monitor = new EventTarget();
    const translator = {
      availability: async () => 'downloading' as const,
      create: (o: TranslatorLanguages & AICreateOptions) => {
        o.monitor?.(monitor as AICreateMonitor);
        return new Promise<Translator>((resolve) => {
          finish = () => resolve({ translate: async (t: string) => `ok ${t}`, destroy: () => {} });
        });
      },
    };
    const tick = (loaded: number) => monitor.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded }));
    const seen: number[] = [];
    const a = translateWithBuiltin('one', settings, { apis: { translator }, stallMs: 40 });
    const b = translateWithBuiltin('two', settings, { apis: { translator }, stallMs: 40, onDownload: (f) => seen.push(f) });
    for (const f of [0.2, 0.5, 0.8]) {
      await new Promise((r) => setTimeout(r, 25));
      tick(f);
    }
    finish!();
    expect((await a).translated).toBe('ok one');
    expect((await b).translated).toBe('ok two');
    expect(seen).toEqual([0.2, 0.5, 0.8]);
  });
});
