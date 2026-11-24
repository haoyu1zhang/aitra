import { z } from 'zod';
import { TranslateError } from '../errors';
import { throwForStatus } from './http';
import type { TranslateOptions, TranslateResult, TranslationProvider } from './types';

const responseSchema = z.object({
  translations: z
    .array(z.object({ text: z.string(), detected_source_language: z.string().optional() }))
    .min(1),
});

const TARGETS: Record<string, string> = {
  'zh-CN': 'ZH-HANS',
  'zh-TW': 'ZH-HANT',
  en: 'EN-US',
  ja: 'JA',
  ko: 'KO',
  fr: 'FR',
  de: 'DE',
  es: 'ES',
  it: 'IT',
  ru: 'RU',
};

export function deeplTarget(code: string): string {
  return TARGETS[code] ?? code.toUpperCase();
}

/** Free-plan keys end with ":fx" and must use the api-free host. */
export function deeplEndpoint(apiKey: string): string {
  const host = apiKey.trim().endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
  return `${host}/v2/translate`;
}

export class DeepLProvider implements TranslationProvider {
  readonly label = 'DeepL';

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  async translate(text: string, options: TranslateOptions): Promise<TranslateResult> {
    if (!this.apiKey) throw new TranslateError('NO_API_KEY');

    const res = await this.fetchImpl(deeplEndpoint(this.apiKey), {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: [text], target_lang: deeplTarget(options.targetLang) }),
      signal: options.signal,
    });
    await throwForStatus(res);

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new TranslateError('BAD_RESPONSE');
    }
    const parsed = responseSchema.safeParse(json);
    if (!parsed.success) throw new TranslateError('BAD_RESPONSE');
    const first = parsed.data.translations[0]!;
    return {
      text: first.text,
      detectedSourceLang: first.detected_source_language?.toLowerCase(),
    };
  }
}
