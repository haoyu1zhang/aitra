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
import { describeError } from '@/lib/errors';
import type { MessageKey, Translator } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/react';
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

function validate(d: Draft): MessageKey | null {
  if (!endpointOrigin(d.baseUrl)) return 'api.error.url';
  if (!d.apiKey) return 'api.error.key';
  if (!d.model) return 'api.error.model';
  return null;
}

function templateLabel(key: ApiTemplate, t: Translator): string {
  return key === 'custom' ? t('api.template.custom') : API_TEMPLATES[key].label;
}

export function ApiManager(props: { settings: Settings; onChange: (next: Settings) => void }) {
  const { settings, onChange } = props;
  const { t } = useI18n();
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
    if (problem) return setNotice({ tone: 'error', text: t(problem) });
    const d = draft;
    void withPermission(d).then((ok) => {
      if (!ok) return setNotice({ tone: 'error', text: t('api.saveDenied') });
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
      setNotice({ tone: 'success', text: t(d.isNew ? 'api.savedActive' : 'api.saved', { name: profile.name }) });
    });
  };

  const test = () => {
    if (!draft) return;
    const problem = validate(draft);
    if (problem) return setNotice({ tone: 'error', text: t(problem) });
    const d = draft;
    setBusy(true);
    setNotice({ tone: 'info', text: t('test.running') });
    void withPermission(d)
      .then(async (ok) => {
        if (!ok) return setNotice({ tone: 'error', text: t('test.denied') });
        const profile: ApiProfile = { id: d.id, name: d.name, baseUrl: d.baseUrl, apiKey: d.apiKey, model: d.model };
        const res = await sendRuntime({
          type: 'provider:test',
          settings: { ...settings, provider: 'openai', apis: [profile], activeApiId: profile.id },
        });
        setNotice(res.ok
          ? { tone: 'success', text: t('test.ok', { ms: res.data.elapsedMs }) }
          : { tone: 'error', text: describeError(t, res.error) });
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="space-y-4">
      {settings.apis.length === 0 && !draft && (
        <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center">
          <p className="text-sm text-slate-600">{t('api.empty')}</p>
          <p className="mt-1 text-xs text-slate-500">{t('api.empty.hint')}</p>
        </div>
      )}

      {settings.apis.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200" role="radiogroup" aria-label={t('api.list')}>
          {settings.apis.map((api) => {
            const active = api.id === activeId;
            return (
              <li key={api.id} className={`flex items-center gap-3 px-3 py-2.5 ${active ? 'bg-accent-soft' : ''}`}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={t('api.use', { name: api.name })}
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
                    {t('api.needsGrant')}
                  </button>
                )}
                <button type="button" onClick={() => startEdit(api)} className="shrink-0 text-xs text-slate-600 hover:text-accent">
                  {t('api.edit')}
                </button>
                <button type="button" onClick={() => remove(api)} className="shrink-0 text-xs text-slate-500 hover:text-red-600">
                  {t('api.delete')}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!draft && (
        <Button onClick={startAdd}>{t('api.add')}</Button>
      )}

      {draft && (
        <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-medium text-slate-900">{draft.isNew ? t('api.addTitle') : t('api.editTitle')}</div>
          <Field label={t('api.template')}>
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
                  {templateLabel(key, t)}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t('api.name')} htmlFor="apiName" hint={t('api.name.hint')}>
            <input
              id="apiName"
              className={inputClass}
              value={draft.name}
              placeholder={t('api.name.placeholder')}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <Field label={t('api.baseUrl')} htmlFor="apiBase" hint={t('api.baseUrl.hint')}>
            <input
              id="apiBase"
              className={inputClass}
              value={draft.baseUrl}
              placeholder="https://api.example.com/v1"
              spellCheck={false}
              onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value, template: 'custom' })}
            />
          </Field>
          <Field label={t('api.key')} htmlFor="apiKey" hint={t('api.key.hint')}>
            <SecretInput id="apiKey" value={draft.apiKey} onChange={(v) => setDraft({ ...draft, apiKey: v })} />
          </Field>
          <Field label={t('api.model')} htmlFor="apiModel" hint={t('api.model.hint')}>
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
            <Button variant="primary" onClick={save} disabled={busy}>{t('button.save')}</Button>
            <Button onClick={test} disabled={busy}>{busy ? t('button.testing') : t('button.test')}</Button>
            <Button onClick={() => { setDraft(null); setNotice(null); }} disabled={busy}>{t('button.cancel')}</Button>
          </div>
        </div>
      )}

      <NoticeLine notice={notice} />
    </div>
  );
}

export function SecretInput(props: { id: string; value: string; onChange: (v: string) => void }) {
  const [visible, setVisible] = useState(false);
  const { t } = useI18n();
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
      <Button onClick={() => setVisible((v) => !v)}>{visible ? t('button.hide') : t('button.show')}</Button>
    </div>
  );
}
