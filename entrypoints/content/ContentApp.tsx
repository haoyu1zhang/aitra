import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { browser } from 'wxt/browser';
import type { TranslateErrorInfo } from '@/lib/errors';
import { messageFor } from '@/lib/errors';
import { languageLabel } from '@/lib/languages';
import { triggerMessageSchema, type TranslateData } from '@/lib/messaging/protocol';
import { requestTranslation } from '@/lib/messaging/translate-client';
import { cornerPoint, isInViewport, placeButton, placeCard, type Point } from '@/lib/dom/position';
import { boundingRect, checkLength, normalizeText, readSelection, type Rect } from '@/lib/dom/selection';
import { copyText } from '@/lib/dom/clipboard';
import { DEFAULT_SETTINGS, getSettings, watchSettings, type Settings } from '@/lib/storage/settings';

type Phase = 'loading' | 'streaming' | 'done' | 'error';

type View =
  | { kind: 'idle' }
  | { kind: 'button'; text: string; range: Range; anchor: Rect }
  | {
      kind: 'card';
      text: string;
      range: Range | null;
      phase: Phase;
      translated: string;
      data?: TranslateData;
      error?: TranslateErrorInfo;
    };

const BUTTON_SIZE = { width: 28, height: 28 };
const DEBOUNCE_MS = 120;

function viewport() {
  return { width: window.innerWidth, height: window.innerHeight };
}

export function ContentApp(props: { host: HTMLElement; shadow: ShadowRoot }) {
  const { host, shadow } = props;
  const [view, setView] = useState<View>({ kind: 'idle' });
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const viewRef = useRef(view);
  const settingsRef = useRef(settings);
  const cancelRef = useRef<(() => void) | null>(null);
  const requestId = useRef(0);
  const debounceTimer = useRef<number | undefined>(undefined);

  viewRef.current = view;
  settingsRef.current = settings;

  useEffect(() => {
    void getSettings().then(setSettings);
    return watchSettings(setSettings);
  }, []);

  const close = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    requestId.current++;
    setView({ kind: 'idle' });
  }, []);

  const translate = useCallback((text: string, range: Range | null) => {
    cancelRef.current?.();
    const id = ++requestId.current;
    setView({ kind: 'card', text, range, phase: 'loading', translated: '' });

    const update = (fn: (v: Extract<View, { kind: 'card' }>) => View) => {
      if (id !== requestId.current) return;
      setView((prev) => (prev.kind === 'card' ? fn(prev) : prev));
    };

    cancelRef.current = requestTranslation(text, {
      onChunk: (full) => update((v) => ({ ...v, phase: 'streaming', translated: full })),
      onDone: (data) => update((v) => ({ ...v, phase: 'done', translated: data.translated, data })),
      onError: (error) => update((v) => ({ ...v, phase: 'error', error })),
    });
  }, []);

  const showError = useCallback((text: string, code: TranslateErrorInfo['code']) => {
    cancelRef.current?.();
    requestId.current++;
    setView({
      kind: 'card',
      text,
      range: null,
      phase: 'error',
      translated: '',
      error: { code, message: messageFor(code), retryable: false },
    });
  }, []);

  // Selection tracking -------------------------------------------------------
  useEffect(() => {
    const fromOwnUi = (e: Event) => e.composedPath().includes(host);

    const evaluate = () => {
      if (viewRef.current.kind === 'card') return;
      if (!settingsRef.current.showButton) {
        if (viewRef.current.kind === 'button') setView({ kind: 'idle' });
        return;
      }
      const result = readSelection(window, { ownHost: host });
      if (result.ok) {
        setView({ kind: 'button', text: result.text, range: result.range, anchor: result.rect });
      } else if (viewRef.current.kind === 'button') {
        setView({ kind: 'idle' });
      }
    };

    const schedule = () => {
      window.clearTimeout(debounceTimer.current);
      debounceTimer.current = window.setTimeout(evaluate, DEBOUNCE_MS);
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 0 || fromOwnUi(e)) return;
      schedule();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (fromOwnUi(e) || e.key === 'Escape') return;
      schedule();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (fromOwnUi(e)) return;
      if (viewRef.current.kind !== 'idle') close();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && viewRef.current.kind !== 'idle') close();
    };

    const onScrollOrResize = () => {
      if (viewRef.current.kind === 'button') setView({ kind: 'idle' });
    };

    window.addEventListener('mouseup', onMouseUp, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onScrollOrResize, { capture: true, passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });
    return () => {
      window.clearTimeout(debounceTimer.current);
      window.removeEventListener('mouseup', onMouseUp, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [host, close]);

  // Shortcut and context menu ----------------------------------------------
  useEffect(() => {
    const listener = (raw: unknown) => {
      const parsed = triggerMessageSchema.safeParse(raw);
      if (!parsed.success) return;

      const result = readSelection(window, { ownHost: host, allowEditable: true });
      if (result.ok) {
        translate(result.text, result.range);
        return;
      }
      if (result.reason === 'too-long' && result.text) {
        showError(result.text, 'TEXT_TOO_LONG');
        return;
      }
      // The selection may live in an iframe or a form field we can't read.
      const fallback = normalizeText(parsed.data.fallbackText ?? '');
      const issue = checkLength(fallback);
      if (issue === 'too-long') showError(fallback, 'TEXT_TOO_LONG');
      else if (!issue) translate(fallback, null);
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, [host, translate, showError]);

  useEffect(() => () => cancelRef.current?.(), []);

  if (view.kind === 'button') {
    const p = placeButton(view.anchor, viewport(), BUTTON_SIZE);
    return (
      <button
        type="button"
        title="翻译（Alt+T）"
        aria-label="翻译选中的文本"
        className="aitra-button fixed flex cursor-pointer items-center justify-center rounded-lg border-0 bg-accent p-0 text-white hover:bg-indigo-700"
        style={{ left: p.x, top: p.y, width: BUTTON_SIZE.width, height: BUTTON_SIZE.height }}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => translate(view.text, view.range)}
      >
        <TranslateIcon />
      </button>
    );
  }

  if (view.kind === 'card') {
    return (
      <Card
        view={view}
        targetLang={settings.targetLang}
        shadow={shadow}
        onClose={close}
        onRetry={() => translate(view.text, view.range)}
      />
    );
  }

  return null;
}

function Card(props: {
  view: Extract<View, { kind: 'card' }>;
  targetLang: string;
  shadow: ShadowRoot;
  onClose: () => void;
  onRetry: () => void;
}) {
  const { view, onClose } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Point | null>(null);
  const [copied, setCopied] = useState(false);
  const frame = useRef(0);

  const reposition = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const vp = viewport();
    const size = { width: el.offsetWidth, height: el.offsetHeight };
    if (!view.range) {
      setPos(cornerPoint(vp, size));
      return;
    }
    const anchor = boundingRect(view.range);
    if (!anchor || !isInViewport(anchor, vp)) {
      onClose();
      return;
    }
    const p = placeCard(anchor, vp, size);
    setPos((prev) => (prev && prev.x === p.x && prev.y === p.y ? prev : { x: p.x, y: p.y }));
  }, [view.range, onClose]);

  useLayoutEffect(() => {
    reposition();
  }, [reposition]);

  // Content grows while streaming; keep the card inside the viewport.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => reposition());
    ro.observe(el);
    return () => ro.disconnect();
  }, [reposition]);

  useEffect(() => {
    const onMove = () => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(reposition);
    };
    window.addEventListener('scroll', onMove, { capture: true, passive: true });
    window.addEventListener('resize', onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame.current);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [reposition]);

  const copy = async () => {
    const ok = await copyText(view.translated, props.shadow.host as HTMLElement);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  const target = view.data?.targetLang ?? props.targetLang;
  const busy = view.phase === 'loading' || view.phase === 'streaming';

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="翻译结果"
      className="aitra-card fixed flex w-[360px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-800"
      style={{ left: pos?.x ?? 0, top: pos?.y ?? 0, visibility: pos ? 'visible' : 'hidden', maxHeight: '60vh' }}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
          <span className="font-semibold text-accent">Aitra</span>
          <span>→ {languageLabel(target)}</span>
          {view.data?.cached && (
            <span className="rounded-md bg-slate-100 px-1.5 py-px text-[11px] text-slate-500">缓存</span>
          )}
        </div>
        <button
          type="button"
          aria-label="关闭"
          onClick={onClose}
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="overflow-y-auto px-3 py-2.5">
        <p
          className="m-0 line-clamp-3 text-xs whitespace-pre-wrap text-slate-500"
          title={view.text.length > 160 ? view.text : undefined}
        >
          {view.text}
        </p>

        <div className="mt-2">
          {view.phase === 'loading' && (
            <div className="space-y-2 py-1" aria-label="翻译中">
              <div className="aitra-skeleton h-3.5 w-11/12 rounded-md" />
              <div className="aitra-skeleton h-3.5 w-3/5 rounded-md" />
            </div>
          )}
          {(view.phase === 'streaming' || view.phase === 'done') && (
            <p
              className={`m-0 text-base break-words whitespace-pre-wrap text-slate-900 ${view.phase === 'streaming' ? 'aitra-caret' : ''}`}
            >
              {view.translated}
            </p>
          )}
          {view.phase === 'error' && view.error && (
            <p role="alert" className="m-0 rounded-lg bg-red-50 px-2.5 py-2 text-sm text-red-700">
              {view.error.message}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-3 py-1.5">
        <span className="truncate text-[11px] text-slate-400">
          {view.data ? `${view.data.provider} · ${view.data.elapsedMs} ms` : busy ? '翻译中…' : ''}
        </span>
        <div className="flex shrink-0 gap-1">
          {view.phase === 'error' && view.error?.code !== 'TEXT_TOO_LONG' && (
            <SmallButton onClick={props.onRetry}>重试</SmallButton>
          )}
          {view.phase === 'done' && (
            <SmallButton onClick={() => void copy()}>{copied ? '已复制' : '复制'}</SmallButton>
          )}
        </div>
      </div>
    </div>
  );
}

function SmallButton(props: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="cursor-pointer rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
    >
      {props.children}
    </button>
  );
}

function TranslateIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5h9M8.5 3v2M6 5c.5 3 2.5 5.5 5.5 7M11 5c-.8 3.6-3.4 6.4-7 8" />
      <path d="M13 21l4-9 4 9M14.5 18h5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
