import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { LANGUAGES } from '@/lib/languages';
import {
  DEFAULT_SETTINGS,
  activeApi,
  getSettings,
  providerLabel,
  saveSettings,
  type ProviderId,
  type Settings,
} from '@/lib/storage/settings';
import { requestEndpointPermission } from '@/lib/permissions';
import { sendRuntime } from '@/lib/messaging/client';
import { ApiManager, SecretInput } from './ApiManager';
import { Button, Field, NoticeLine, Section, Toggle, inputClass, type Notice } from './components';

const PROVIDERS: { id: ProviderId; title: string; desc: string }[] = [
  { id: 'mock', title: 'Mock', desc: '本地模拟译文，不联网，适合演示' },
  { id: 'openai', title: 'AI 接口', desc: '保存多个 DeepSeek、OpenAI 或兼容接口，随时切换' },
  { id: 'deepl', title: 'DeepL', desc: '专业机器翻译，免费版每月 50 万字符' },
];

export function OptionsApp() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [testNotice, setTestNotice] = useState<Notice>(null);
  const [testing, setTesting] = useState(false);
  const [cacheCount, setCacheCount] = useState<number | null>(null);
  const [cacheMax, setCacheMax] = useState(500);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    void getSettings().then(setSettings);
    void refreshCache();
  }, []);

  const refreshCache = useCallback(async () => {
    const res = await sendRuntime({ type: 'cache:stats' });
    if (res.ok) {
      setCacheCount(res.data.count);
      setCacheMax(res.data.max);
    }
  }, []);

  const update = useCallback((next: Settings) => {
    setSettings(next);
    setTestNotice(null);
    setSaveState('saving');
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void saveSettings(next).then(() => setSaveState('saved'));
    }, 350);
  }, []);

  if (!settings) return null;

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => update({ ...settings, [key]: value });
  const runTest = () => {
    const snapshot = settings;
    const api = snapshot.provider === 'openai' ? activeApi(snapshot) : null;
    // Resolves right away when the origin is built in or already granted.
    const grantFirst = api ? requestEndpointPermission(api.baseUrl) : Promise.resolve(true);
    setTesting(true);
    setTestNotice({ tone: 'info', text: '正在测试…' });
    void grantFirst
      .then(async (ok) => {
        if (!ok) {
          setTestNotice({ tone: 'error', text: '没有获得授权，扩展无法访问这个接口。' });
          return;
        }
        const res = await sendRuntime({ type: 'provider:test', settings: snapshot });
        if (res.ok) {
          setTestNotice({
            tone: 'success',
            text: `连接正常，用时 ${res.data.elapsedMs} ms。样句译文：${res.data.sample}`,
          });
        } else {
          setTestNotice({ tone: 'error', text: res.error.message });
        }
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

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Aitra</h1>
          <p className="mt-1 text-sm text-slate-500">选中网页文本，点一下就能看到译文。</p>
        </div>
        <span className="text-xs text-slate-400" aria-live="polite">
          {saveState === 'saving' ? '保存中…' : saveState === 'saved' ? '已保存' : ''}
        </span>
      </header>

      <div className="space-y-6">
        <Section title="翻译">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="目标语言" htmlFor="target">
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
            <Field
              label="备用语言"
              htmlFor="fallback"
              hint="选中的文本本身就是目标语言时，改为翻译成这个语言。"
            >
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
          </div>
          <Toggle
            label="选中文本后显示翻译按钮"
            checked={settings.showButton}
            onChange={(v) => set('showButton', v)}
          />
        </Section>

        <Section title="翻译服务">
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
                  <div className="text-sm font-medium text-slate-900">{p.title}</div>
                  <div className="mt-1 text-xs leading-relaxed text-slate-500">{p.desc}</div>
                </button>
              );
            })}
          </div>

          {settings.provider === 'openai' && <ApiManager settings={settings} onChange={update} />}

          {settings.provider === 'deepl' && (
            <Field
              label="DeepL API Key"
              htmlFor="deeplKey"
              hint="免费版 Key 以 :fx 结尾，会自动使用 api-free.deepl.com。"
            >
              <SecretInput
                id="deeplKey"
                value={settings.deepl.apiKey}
                onChange={(v) => update({ ...settings, deepl: { apiKey: v } })}
              />
            </Field>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              onClick={runTest}
              disabled={testing || (settings.provider === 'openai' && !activeApi(settings))}
            >
              {testing ? '测试中…' : settings.provider === 'openai' ? '测试当前接口' : '测试连接'}
            </Button>
            <Button
              onClick={() => update({ ...DEFAULT_SETTINGS, targetLang: settings.targetLang })}
              disabled={testing}
            >
              恢复默认
            </Button>
          </div>
          <NoticeLine notice={testNotice} />

          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
            翻译时，你选中的文本会发送给当前服务：<strong>{providerLabel(settings)}</strong>。
            {settings.provider === 'mock' && ' Mock 模式只在本地生成模拟译文，不会发出任何网络请求。'}
          </p>
        </Section>

        <Section title="缓存" description="同样的文本、目标语言和服务只请求一次，结果保存在本地。">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-700">
              已缓存 <strong>{cacheCount ?? '—'}</strong> / {cacheMax} 条
            </span>
            <Button variant="danger" onClick={() => void clearCache()} disabled={!cacheCount}>
              清理缓存
            </Button>
          </div>
        </Section>

        <Section title="快捷键与菜单">
          <ul className="space-y-2 text-sm text-slate-700">
            <li>
              <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-xs">Alt</kbd>
              {' + '}
              <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-xs">T</kbd>
              ：翻译当前选中的文本
            </li>
            <li>右键菜单：选中文本后点击“翻译选中内容”</li>
          </ul>
          <p className="text-xs text-slate-500">
            快捷键和其他扩展冲突时不会生效，可以在{' '}
            <button type="button" onClick={openShortcuts} className="text-accent underline">
              chrome://extensions/shortcuts
            </button>{' '}
            里改成别的组合。
          </p>
        </Section>
      </div>
    </div>
  );
}
