export const LANGUAGES = [
  { code: 'zh-CN', label: '简体中文', english: 'Simplified Chinese' },
  { code: 'zh-TW', label: '繁體中文', english: 'Traditional Chinese' },
  { code: 'en', label: 'English', english: 'English' },
  { code: 'ja', label: '日本語', english: 'Japanese' },
  { code: 'ko', label: '한국어', english: 'Korean' },
  { code: 'fr', label: 'Français', english: 'French' },
  { code: 'de', label: 'Deutsch', english: 'German' },
  { code: 'es', label: 'Español', english: 'Spanish' },
  { code: 'it', label: 'Italiano', english: 'Italian' },
  { code: 'ru', label: 'Русский', english: 'Russian' },
] as const;

export type LangCode = (typeof LANGUAGES)[number]['code'];

export const LANG_CODES = LANGUAGES.map((l) => l.code) as [LangCode, ...LangCode[]];

export function languageName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.english ?? code;
}

export function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

/**
 * Rough script-based guess. Good enough to decide whether the selection is
 * already in the target language; providers that report a detected language
 * take precedence.
 */
export function guessLanguage(text: string): string | undefined {
  const sample = text.slice(0, 400);
  const count = (re: RegExp) => (sample.match(re) ?? []).length;

  const kana = count(/[぀-ヿ]/g);
  const hangul = count(/[가-힯]/g);
  const han = count(/[一-鿿]/g);
  const cyrillic = count(/[Ѐ-ӿ]/g);
  const latin = count(/[A-Za-z]/g);

  if (kana > 0 && kana + han > latin) return 'ja';
  if (hangul > latin && hangul > han) return 'ko';
  if (han > latin) return 'zh';
  if (cyrillic > latin) return 'ru';
  // Latin script covers too many languages to guess from characters alone.
  return undefined;
}

export function sameLanguage(detected: string | undefined, target: string): boolean {
  if (!detected) return false;
  const a = detected.toLowerCase().split('-')[0];
  const b = target.toLowerCase().split('-')[0];
  return a === b;
}
