import { createContext, Fragment, useContext, useMemo, type ReactNode } from 'react';
import { createTranslator, resolveUiLang, translate, type MessageKey, type Translator, type UiLang, type UiLangSetting } from './index';

interface I18n {
  lang: UiLang;
  t: Translator;
  /** Like t(), but placeholders can be filled with elements. */
  tx: (key: MessageKey, parts: Record<string, ReactNode>) => ReactNode;
}

const I18nContext = createContext<I18n | null>(null);

function build(lang: UiLang): I18n {
  return {
    lang,
    t: createTranslator(lang),
    tx(key, parts) {
      const template = translate(lang, key);
      const pieces = template.split(/(\{\w+\})/g);
      return pieces.map((piece, i) => {
        const name = /^\{(\w+)\}$/.exec(piece)?.[1];
        return <Fragment key={i}>{name && name in parts ? parts[name] : piece}</Fragment>;
      });
    },
  };
}

export function I18nProvider(props: { setting: UiLangSetting; children: ReactNode }) {
  const lang = resolveUiLang(props.setting);
  const value = useMemo(() => build(lang), [lang]);
  return <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  return ctx ?? build('en');
}
