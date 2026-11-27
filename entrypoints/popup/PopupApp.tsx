import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { LANGUAGES } from '@/lib/languages';
import {
  apiLabel,
  getSettings,
  isConfigured,
  updateSettings,
  type ProviderId,
  type Settings,
} from '@/lib/storage/settings';
import type { MessageKey } from '@/lib/i18n';
import { I18nProvider, useI18n } from '@/lib/i18n/react';
import { serviceName } from '@/lib/service-name';

const PROVIDER_OPTIONS: { id: ProviderId; label: MessageKey }[] = [
  { id: 'builtin', label: 'provider.builtin.short' },
  { id: 'openai', label: 'provider.openai.title' },
  { id: 'deepl', label: 'provider.deepl.title' },
];

export function PopupApp() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);

  if (!settings) return <div className="h-48 w-72" />;

  return (
    <I18nProvider setting={settings.uiLang}>
      <Popup settings={settings} onChange={setSettings} />
    </I18nProvider>
  );
}

function Popup({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const { t, lang } = useI18n();
  const patch = async (p: Partial<Settings>) => onChange(await updateSettings(p));
  const current = serviceName(settings, t);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <div className="w-72 space-y-4 bg-white p-4 text-slate-800">
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold">Aitra</span>
        <button
          type="button"
          className="text-xs text-accent hover:underline"
          onClick={() => void browser.runtime.openOptionsPage()}
        >
          {t('popup.settings')}
        </button>
      </div>

      <label className="block">
        <span className="text-xs text-slate-500">{t('popup.translateTo')}</span>
        <select
          className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          value={settings.targetLang}
          onChange={(e) => void patch({ targetLang: e.target.value as Settings['targetLang'] })}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </label>

      <div>
        <span className="text-xs text-slate-500">{t('popup.service')}</span>
        <div className="mt-1 grid grid-cols-3 gap-1 rounded-md bg-slate-100 p-1">
          {PROVIDER_OPTIONS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => void patch({ provider: p.id })}
              className={`rounded px-2 py-1 text-xs ${
                settings.provider === p.id ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              {t(p.label)}
            </button>
          ))}
        </div>
        {settings.provider === 'openai' && settings.apis.length > 1 ? (
          <select
            aria-label={t('popup.pickApi')}
            className="mt-2 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
            value={settings.activeApiId ?? ''}
            onChange={(e) => void patch({ activeApiId: e.target.value })}
          >
            {settings.apis.map((a) => (
              <option key={a.id} value={a.id}>{apiLabel(a)}</option>
            ))}
          </select>
        ) : (
          <p className="mt-1.5 truncate text-xs text-slate-500" title={current}>
            {t('popup.current', { name: current })}
          </p>
        )}
        {!isConfigured(settings) && (
          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2">
            <p className="text-xs leading-relaxed text-amber-800">{t('error.NOT_CONFIGURED')}</p>
            <button
              type="button"
              onClick={() => void browser.runtime.openOptionsPage()}
              className="mt-2 w-full rounded-md bg-accent px-2 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
            >
              {t('card.openSettings')}
            </button>
          </div>
        )}
      </div>

      <p className="border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
        {t('popup.help', { menu: t('menu.translate') })}
      </p>
    </div>
  );
}
