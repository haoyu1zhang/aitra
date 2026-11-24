import { de } from './locales/de';
import { en, type MessageKey, type Messages } from './locales/en';
import { es } from './locales/es';
import { fr } from './locales/fr';
import { it } from './locales/it';
import { ja } from './locales/ja';
import { ko } from './locales/ko';
import { zhCN } from './locales/zh-CN';

export type { MessageKey };

export const UI_LANGUAGES = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'it', label: 'Italiano' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
] as const;

export type UiLang = (typeof UI_LANGUAGES)[number]['code'];
export const UI_LANG_CODES = UI_LANGUAGES.map((l) => l.code) as [UiLang, ...UiLang[]];
export const UI_LANG_SETTINGS = ['auto', ...UI_LANG_CODES] as const;
export type UiLangSetting = (typeof UI_LANG_SETTINGS)[number];

const DICTIONARIES: Record<UiLang, Messages> = {
  'zh-CN': zhCN,
  en,
  es,
  ja,
  ko,
  it,
  de,
  fr,
};

/** Maps a browser locale like "pt-BR" or "zh-Hant-TW" to a supported UI language. */
export function matchUiLang(locale: string | undefined): UiLang {
  const base = (locale ?? '').toLowerCase().split(/[-_]/)[0] ?? '';
  if (base === 'zh') return 'zh-CN';
  const hit = UI_LANG_CODES.find((code) => code === base);
  return hit ?? 'en';
}

export function resolveUiLang(setting: UiLangSetting, browserLocale = globalThis.navigator?.language): UiLang {
  return setting === 'auto' ? matchUiLang(browserLocale) : setting;
}

export type Params = Record<string, string | number>;

export function translate(lang: UiLang, key: MessageKey, params?: Params): string {
  const template = DICTIONARIES[lang][key] ?? en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export type Translator = (key: MessageKey, params?: Params) => string;

export function createTranslator(lang: UiLang): Translator {
  return (key, params) => translate(lang, key, params);
}
