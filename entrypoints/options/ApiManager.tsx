import { useEffect, useState } from 'react';
import {
  API_TEMPLATES,
  apiLabel,
  endpointOrigin,
  newApiId,
  type ApiProfile,
  type ApiTemplate,
  type Settings,
} from '@/lib/storage/settings';
import { hasEndpointPermission, isBuiltInOrigin, requestEndpointPermission } from '@/lib/permissions';
import { sendRuntime } from '@/lib/messaging/client';
import { Button, Field, NoticeLine, inputClass, type Notice } from './components';

interface Draft extends ApiProfile {
  template: ApiTemplate;
  isNew: boolean;
}

function draftFrom(template: ApiTemplate): Draft {
  const t = API_TEMPLATES[template];
  return {
    id: newApiId(),
    name: template === 'custom' ? '' : t.label,
    baseUrl: t.baseUrl,
    apiKey: '',
    model: t.model,
    template,
    isNew: true,
  };
}

function templateOf(api: ApiProfile): ApiTemplate {
  const entry = (Object.entries(API_TEMPLATES) as [ApiTemplate, (typeof API_TEMPLATES)[ApiTemplate]][])
    .find(([key, t]) => key !== 'custom' && t.baseUrl === api.baseUrl);
  return entry?.[0] ?? 'custom';
}

function validate(d: Draft): string | null {
  if (!endpointOrigin(d.baseUrl)) return '接口地址需要以 https:// 或 http:// 开头。';
  if (!d.apiKey) return '请填写 API Key。';
  if (!d.model) return '请填写模型名称。';
  return null;
}

export function ApiManager(props: { settings: Settings; onChange: (next: Settings) => void }) {
  const { settings, onChange } = props;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState<Set<string>>(new Set());

  // Saved custom endpoints whose permission was revoked or never granted.
  useEffect(() => {
    let cancelled = false;
    void Promise.all(settings.apis.map(async (a) => [a.id, await hasEndpointPermission(a.baseUrl)] as const))
      .then((rows) => {
        if (!cancelled) setMissing(new Set(rows.filter(([, ok]) => !ok).map(([id]) => id)));
      });
    return () => {
      cancelled = true;
    };
  }, [settings.apis]);

  const activeId = settings.activeApiId ?? settings.apis[0]?.id ?? null;

  const select = (api: ApiProfile) => {
    setNotice(null);
    onChange({ ...settings, activeApiId: api.id });
  };

  const startAdd = () => {
    setDraft(draftFrom(settings.apis.length ? 'custom' : 'deepseek'));
    setNotice(null);
  };

  const startEdit = (api: ApiProfile) => {
    setDraft({ ...api, template: templateOf(api), isNew: false });
    setNotice(null);
  };

  const remove = (api: ApiProfile) => {
    const apis = settings.apis.filter((a) => a.id !== api.id);
    const nextActive = settings.activeApiId === api.id ? apis[0]?.id ?? null : settings.activeApiId;
    onChange({ ...settings, apis, activeApiId: nextActive });
    if (draft?.id === api.id) setDraft(null);
  };

  const grant = (api: ApiProfile) => {
    void requestEndpointPermission(api.baseUrl).then((ok) => {
      if (ok) setMissing((prev) => new Set([...prev].filter((id) => id !== api.id)));
    });
  };

  const chooseTemplate = (template: ApiTemplate) => {
    if (!draft) return;
    const t = API_TEMPLATES[template];
    setDraft({
      ...draft,
      template,
      baseUrl: template === 'custom' ? draft.baseUrl : t.baseUrl,
      model: template === 'custom' ? draft.model : t.model,
      name: draft.name && draft.name !== API_TEMPLATES[draft.template].label ? draft.name : template === 'custom' ? '' : t.label,
    });
  };

  // Permission has to be requested inside the click, before any await.
  const withPermission = (d: Draft): Promise<boolean> => {
    const origin = endpointOrigin(d.baseUrl);
    if (!origin || isBuiltInOrigin(origin)) return Promise.resolve(true);
    return requestEndpointPermission(d.baseUrl);
  };

  const save = () => {
    if (!draft) return;
    const problem = validate(draft);
    if (problem) return setNotice({ tone: 'error', text: problem });
    const d = draft;
    void withPermission(d).then((ok) => {
      if (!ok) return setNotice({ tone: 'error', text: '没有获得授权，扩展无法访问这个接口，所以没有保存。' });
      const profile: ApiProfile = {
        id: d.id,
        name: d.name.trim() || endpointOrigin(d.baseUrl)!.replace(/^https?:\/\//, ''),
        baseUrl: d.baseUrl.trim(),
        apiKey: d.apiKey.trim(),
        model: d.model.trim(),
      };
      const apis = d.isNew
        ? [...settings.apis, profile]
        : settings.apis.map((a) => (a.id === profile.id ? profile : a));
      onChange({
        ...settings,
        apis,
        activeApiId: d.isNew || !settings.activeApiId ? profile.id : settings.activeApiId,
      });
      setDraft(null);
      setNotice({ tone: 'success', text: `已保存“${profile.name}”${d.isNew ? '，并设为当前使用的接口' : ''}。` });
    });
  };

  const test = () => {
    if (!draft) return;
    const problem = validate(draft);
    if (problem) return setNotice({ tone: 'error', text: problem });
    const d = draft;
    setBusy(true);
    setNotice({ tone: 'info', text: '正在测试…' });
    void withPermission(d)
      .then(async (ok) => {
        if (!ok) return setNotice({ tone: 'error', text: '没有获得授权，扩展无法访问这个接口。' });
        const profile: ApiProfile = { id: d.id, name: d.name, baseUrl: d.baseUrl, apiKey: d.apiKey, model: d.model };
        const res = await sendRuntime({
          type: 'provider:test',
          settings: { ...settings, provider: 'openai', apis: [profile], activeApiId: profile.id },
        });
        setNotice(res.ok
          ? { tone: 'success', text: `连接正常，用时 ${res.data.elapsedMs} ms。样句译文：${res.data.sample}` }
          : { tone: 'error', text: res.error.message });
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="space-y-4">
      {settings.apis.length === 0 && !draft && (
        <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center">
          <p className="text-sm text-slate-600">还没有添加 AI 接口。</p>
          <p className="mt-1 text-xs text-slate-500">支持 DeepSeek、OpenAI 和任何 OpenAI 兼容接口，可以保存多个，随时切换。</p>
        </div>
      )}

      {settings.apis.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200" role="radiogroup" aria-label="已保存的接口">
          {settings.apis.map((api) => {
            const active = api.id === activeId;
            return (
              <li key={api.id} className={`flex items-center gap-3 px-3 py-2.5 ${active ? 'bg-accent-soft' : ''}`}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={`使用 ${api.name}`}
                  onClick={() => select(api)}
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${active ? 'border-accent' : 'border-slate-400'}`}
                >
                  {active && <span className="h-2 w-2 rounded-full bg-accent" />}
                </button>
                <button
                  type="button"
                  onClick={() => select(api)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-sm font-medium text-slate-900">{apiLabel(api)}</div>
                  <div className="truncate text-xs text-slate-500">{api.baseUrl}</div>
                </button>
                {missing.has(api.id) && (
                  <button type="button" onClick={() => grant(api)} className="shrink-0 text-xs text-amber-700 underline">
                    需要授权
                  </button>
                )}
                <button type="button" onClick={() => startEdit(api)} className="shrink-0 text-xs text-slate-600 hover:text-accent">
                  编辑
                </button>
                <button type="button" onClick={() => remove(api)} className="shrink-0 text-xs text-slate-500 hover:text-red-600">
                  删除
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!draft && (
        <Button onClick={startAdd}>+ 添加接口</Button>
      )}

      {draft && (
        <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-medium text-slate-900">{draft.isNew ? '添加接口' : '编辑接口'}</div>
          <Field label="模板">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(API_TEMPLATES) as ApiTemplate[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => chooseTemplate(key)}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    draft.template === key
                      ? 'border-accent bg-white text-accent'
                      : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {API_TEMPLATES[key].label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="名称" htmlFor="apiName" hint="只用来区分不同接口，可以留空。">
            <input
              id="apiName"
              className={inputClass}
              value={draft.name}
              placeholder="例如：DeepSeek 官方、公司中转"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <Field label="接口地址（Base URL）" htmlFor="apiBase" hint="请求会发到 {Base URL}/chat/completions。">
            <input
              id="apiBase"
              className={inputClass}
              value={draft.baseUrl}
              placeholder="https://api.example.com/v1"
              spellCheck={false}
              onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value, template: 'custom' })}
            />
          </Field>
          <Field label="API Key" htmlFor="apiKey" hint="只保存在本机浏览器里。">
            <SecretInput id="apiKey" value={draft.apiKey} onChange={(v) => setDraft({ ...draft, apiKey: v })} />
          </Field>
          <Field label="模型" htmlFor="apiModel" hint="翻译时会自动尝试关闭模型的推理/思考模式。">
            <input
              id="apiModel"
              className={inputClass}
              value={draft.model}
              placeholder="model name"
              spellCheck={false}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" onClick={save} disabled={busy}>保存</Button>
            <Button onClick={test} disabled={busy}>{busy ? '测试中…' : '测试连接'}</Button>
            <Button onClick={() => { setDraft(null); setNotice(null); }} disabled={busy}>取消</Button>
          </div>
        </div>
      )}

      <NoticeLine notice={notice} />
    </div>
  );
}

export function SecretInput(props: { id: string; value: string; onChange: (v: string) => void }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex gap-2">
      <input
        id={props.id}
        type={visible ? 'text' : 'password'}
        className={inputClass}
        value={props.value}
        autoComplete="off"
        spellCheck={false}
        placeholder="sk-..."
        onChange={(e) => props.onChange(e.target.value)}
      />
      <Button onClick={() => setVisible((v) => !v)}>{visible ? '隐藏' : '显示'}</Button>
    </div>
  );
}
