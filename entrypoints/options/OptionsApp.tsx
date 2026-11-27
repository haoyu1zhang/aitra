import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { LANGUAGES } from '@/lib/languages';
import {
  DEFAULT_SETTINGS,
  activeApi,
  getSettings,
  isConfigured,
  saveSettings,
  type ProviderId,
  type Settings,
} from '@/lib/storage/settings';
import { describeError } from '@/lib/errors';
import { UI_LANGUAGES, type MessageKey, type UiLangSetting } from '@/lib/i18n';
import { I18nProvider, useI18n } from '@/lib/i18n/react';
import { requestEndpointPermission } from '@/lib/permissions';
import { sendRuntime } from '@/lib/messaging/client';
import { ApiManager, SecretInput } from './ApiManager';
import { BuiltinPanel } from './BuiltinPanel';
import { translateWithBuiltin } from '@/lib/builtin/translator';
import { normalizeError } from '@/lib/errors';
import { serviceName as nameOf } from '@/lib/service-name';
import { Button, Field, NoticeLine, Section, Toggle, inputClass, type Notice } from './components';

const PROVIDERS: { id: ProviderId; title: MessageKey; desc: MessageKey }[] = [
  { id: 'builtin', title: 'provider.builtin.title', desc: 'provider.builtin.desc' },
  { id: 'openai', title: 'provider.openai.title', desc: 'provider.openai.desc' },
  { id: 'deepl', title: 'provider.deepl.title', desc: 'provider.deepl.desc' },
];

const kbd = 'rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-xs';

export function OptionsApp() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);

  const update = useCallback((next: Settings) => {
    setSettings(next);
    setSaveState('saving');
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void saveSettings(next).then(() => setSaveState('saved'));
    }, 350);
  }, []);

  if (!settings) return null;

  return (
    <I18nProvider setting={settings.uiLang}>
      <OptionsPage settings={settings} update={update} saveState={saveState} />
    </I18nProvider>
  );
}

function OptionsPage(props: {
  settings: Settings;
  update: (next: Settings) => void;
  saveState: 'idle' | 'saving' | 'saved';
}) {
  const { settings, update, saveState } = props;
  const { t, tx, lang } = useI18n();
  const [testNotice, setTestNotice] = useState<Notice>(null);
  const [testing, setTesting] = useState(false);
  const [cacheCount, setCacheCount] = useState<number | null>(null);
  const [cacheMax, setCacheMax] = useState(500);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = `Aitra · ${t('popup.settings')}`;
  }, [lang, t]);

  useEffect(() => {
    void sendRuntime({ type: 'cache:stats' }).then((res) => {
      if (res.ok) {
        setCacheCount(res.data.count);
        setCacheMax(res.data.max);
      }
    });
  }, []);

  const change = (next: Settings) => {
    setTestNotice(null);
    update(next);
  };
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => change({ ...settings, [key]: value });

  const runTest = () => {
    const snapshot = settings;
    // The built-in translator only exists in pages, so test it right here.
    if (snapshot.provider === 'builtin') {
      setTesting(true);
      setTestNotice({ tone: 'info', text: t('test.running') });
      void translateWithBuiltin('The weather is nice today, so we are going for a walk.', snapshot)
        .then((data) => setTestNotice({ tone: 'success', text: t('test.ok', { ms: data.elapsedMs }) }))
        .catch((err: unknown) => setTestNotice({ tone: 'error', text: describeError(t, normalizeError(err).toInfo()) }))
        .finally(() => setTesting(false));
      return;
    }
    const api = snapshot.provider === 'openai' ? activeApi(snapshot) : null;
    // Resolves right away when the origin is built in or already granted.
    const grantFirst = api ? requestEndpointPermission(api.baseUrl) : Promise.resolve(true);
    setTesting(true);
    setTestNotice({ tone: 'info', text: t('test.running') });
    void grantFirst
      .then(async (ok) => {
        if (!ok) {
          setTestNotice({ tone: 'error', text: t('test.denied') });
          return;
        }
        const res = await sendRuntime({ type: 'provider:test', settings: snapshot });
        setTestNotice(res.ok
          ? { tone: 'success', text: t('test.ok', { ms: res.data.elapsedMs }) }
          : { tone: 'error', text: describeError(t, res.error) });
      })
      .finally(() => setTesting(false));
  };

  const clearCache = async () => {
    const res = await sendRuntime({ type: 'cache:clear' });
    if (res.ok) setCacheCount(res.data.count);
  };

  const openShortcuts = () => {
    void browser.tabs.create({ url: 'chrome://extensions/shortcuts' });
  };

  const serviceName = nameOf(settings, t);

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Aitra</h1>
          <p className="mt-1 text-sm text-slate-500">{t('app.tagline')}</p>
        </div>
        <span className="shrink-0 text-xs text-slate-400" aria-live="polite">
          {saveState === 'saving' ? t('app.saving') : saveState === 'saved' ? t('app.saved') : ''}
        </span>
      </header>

      <div className="space-y-6">
        {!isConfigured(settings) && (
          <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
            <h2 className="text-sm font-semibold text-amber-900">{t('setup.title')}</h2>
            <p className="mt-1 text-sm leading-relaxed text-amber-800">{t('setup.body')}</p>
          </div>
        )}

        <Section title={t('section.translation')}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('field.targetLang')} htmlFor="target">
              <select
                id="target"
                className={inputClass}
                value={settings.targetLang}
                onChange={(e) => set('targetLang', e.target.value as Settings['targetLang'])}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </Field>
            <Field label={t('field.fallbackLang')} htmlFor="fallback" hint={t('field.fallbackLang.hint')}>
              <select
                id="fallback"
                className={inputClass}
                value={settings.fallbackLang}
                onChange={(e) => set('fallbackLang', e.target.value as Settings['fallbackLang'])}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </Field>
            <Field label={t('field.uiLang')} htmlFor="uiLang">
              <select
                id="uiLang"
                className={inputClass}
                value={settings.uiLang}
                onChange={(e) => set('uiLang', e.target.value as UiLangSetting)}
              >
                <option value="auto">{t('uiLang.auto')}</option>
                {UI_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </Field>
          </div>
          <Toggle label={t('field.showButton')} checked={settings.showButton} onChange={(v) => set('showButton', v)} />
        </Section>

        <Section title={t('section.service')}>
          <div className="grid gap-3 sm:grid-cols-3" role="radiogroup">
            {PROVIDERS.map((p) => {
              const active = settings.provider === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => set('provider', p.id)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    active ? 'border-accent bg-accent-soft' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="text-sm font-medium text-slate-900">{t(p.title)}</div>
                  <div className="mt-1 text-xs leading-relaxed text-slate-500">{t(p.desc)}</div>
                </button>
              );
            })}
          </div>

          {settings.provider === 'openai' && <ApiManager settings={settings} onChange={change} />}

          {settings.provider === 'builtin' && <BuiltinPanel settings={settings} onChange={change} />}

          {settings.provider === 'deepl' && (
            <Field label={t('deepl.key')} htmlFor="deeplKey" hint={t('deepl.key.hint')}>
              <SecretInput
                id="deeplKey"
                value={settings.deepl.apiKey}
                onChange={(v) => change({ ...settings, deepl: { apiKey: v } })}
              />
            </Field>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              onClick={runTest}
              disabled={testing || !isConfigured(settings)}
            >
              {testing ? t('button.testing') : settings.provider === 'openai' ? t('button.testCurrent') : t('button.test')}
            </Button>
            <Button
              onClick={() => change({ ...DEFAULT_SETTINGS, targetLang: settings.targetLang, uiLang: settings.uiLang })}
              disabled={testing}
            >
              {t('button.reset')}
            </Button>
          </div>
          <NoticeLine notice={testNotice} />

          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
            {settings.provider === 'builtin'
              ? t('privacy.local')
              : tx('privacy.sentTo', { name: <strong>{serviceName}</strong> })}
          </p>
        </Section>

        <Section title={t('section.cache')} description={t('cache.desc')}>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-slate-700">
              {tx('cache.count', { count: <strong>{cacheCount ?? '—'}</strong>, max: cacheMax })}
            </span>
            <Button variant="danger" onClick={() => void clearCache()} disabled={!cacheCount}>
              {t('button.clearCache')}
            </Button>
          </div>
        </Section>

        <Section title={t('section.shortcuts')}>
          <ul className="space-y-2 text-sm text-slate-700">
            <li>
              <kbd className={kbd}>Alt</kbd> + <kbd className={kbd}>T</kbd>
              <span className="ml-2">{t('shortcuts.key')}</span>
            </li>
            <li>{t('shortcuts.menu', { menu: t('menu.translate') })}</li>
          </ul>
          <p className="text-xs text-slate-500">
            {tx('shortcuts.conflict', {
              link: (
                <button type="button" onClick={openShortcuts} className="text-accent underline">
                  chrome://extensions/shortcuts
                </button>
              ),
            })}
          </p>
        </Section>
      </div>
    </div>
  );
}
