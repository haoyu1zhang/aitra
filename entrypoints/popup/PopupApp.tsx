import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { LANGUAGES } from '@/lib/languages';
import {
  getSettings,
  providerLabel,
  updateSettings,
  type ProviderId,
  type Settings,
} from '@/lib/storage/settings';

const PROVIDER_OPTIONS: { id: ProviderId; label: string }[] = [
  { id: 'mock', label: 'Mock' },
  { id: 'openai', label: 'AI 接口' },
  { id: 'deepl', label: 'DeepL' },
];

export function PopupApp() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);

  if (!settings) return <div className="h-48 w-72" />;

  const patch = async (p: Partial<Settings>) => setSettings(await updateSettings(p));

  return (
    <div className="w-72 space-y-4 bg-white p-4 text-slate-800">
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold">Aitra</span>
        <button
          type="button"
          className="text-xs text-accent hover:underline"
          onClick={() => void browser.runtime.openOptionsPage()}
        >
          设置
        </button>
      </div>

      <label className="block">
        <span className="text-xs text-slate-500">翻译成</span>
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
        <span className="text-xs text-slate-500">翻译服务</span>
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
              {p.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 truncate text-xs text-slate-500" title={providerLabel(settings)}>
          当前：{providerLabel(settings)}
        </p>
      </div>

      <p className="border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
        选中文本后点击浮动按钮，或按 Alt+T、右键“翻译选中内容”。选中的文本会发送给当前翻译服务。
      </p>
    </div>
  );
}
