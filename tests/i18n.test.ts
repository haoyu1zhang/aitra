import { describe, expect, it } from 'vitest';
import { UI_LANG_CODES, matchUiLang, resolveUiLang, translate } from '../lib/i18n';
import { en } from '../lib/i18n/locales/en';
import { de } from '../lib/i18n/locales/de';
import { es } from '../lib/i18n/locales/es';
import { fr } from '../lib/i18n/locales/fr';
import { it as itLocale } from '../lib/i18n/locales/it';
import { ja } from '../lib/i18n/locales/ja';
import { ko } from '../lib/i18n/locales/ko';
import { zhCN } from '../lib/i18n/locales/zh-CN';

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');

describe('i18n', () => {
  const all = { de, es, fr, it: itLocale, ja, ko, 'zh-CN': zhCN };

  it('every language has every key and the same placeholders', () => {
    for (const [lang, dict] of Object.entries(all)) {
      expect(Object.keys(dict).sort(), lang).toEqual(Object.keys(en).sort());
      for (const key of Object.keys(en) as (keyof typeof en)[]) {
        expect(placeholders(dict[key]), `${lang} ${key}`).toBe(placeholders(en[key]));
        expect(dict[key].trim().length, `${lang} ${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('matches browser locales', () => {
    expect(matchUiLang('zh-TW')).toBe('zh-CN');
    expect(matchUiLang('ja-JP')).toBe('ja');
    expect(matchUiLang('it')).toBe('it');
    expect(matchUiLang('pt-BR')).toBe('en');
    expect(matchUiLang(undefined)).toBe('en');
    expect(resolveUiLang('auto', 'de-AT')).toBe('de');
    expect(resolveUiLang('ko', 'de-AT')).toBe('ko');
    expect(UI_LANG_CODES).toHaveLength(8);
  });

  it('fills placeholders', () => {
    expect(translate('en', 'test.ok', { ms: 120, sample: '你好' })).toBe('Connected in 120 ms. Sample translation: 你好');
    expect(translate('fr', 'api.use', { name: 'X' })).toBe('Utiliser X');
  });
});
