import { browser } from 'wxt/browser';
import { TranslateError, type TranslateErrorInfo } from '../errors';
import { TRANSLATE_PORT, portEventSchema, type TranslateData } from './protocol';

export interface TranslateHandlers {
  onChunk: (fullText: string) => void;
  onDone: (data: TranslateData) => void;
  onError: (error: TranslateErrorInfo) => void;
}

// Hard stop on the content side, in case the background never answers.
const IDLE_LIMIT_MS = 45_000;

/**
 * Opens a port to the background and streams the translation back.
 * Returns a function that cancels the request.
 */
export function requestTranslation(text: string, handlers: TranslateHandlers): () => void {
  let finished = false;
  let buffer = '';
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  const finish = () => {
    finished = true;
    clearTimeout(idleTimer);
  };

  const fail = (info: TranslateErrorInfo) => {
    if (finished) return;
    finish();
    handlers.onError(info);
  };

  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      fail(new TranslateError('TIMEOUT').toInfo());
      port?.disconnect();
    }, IDLE_LIMIT_MS);
  };

  let port: ReturnType<typeof browser.runtime.connect> | undefined;
  try {
    port = browser.runtime.connect({ name: TRANSLATE_PORT });
  } catch {
    // Happens after the extension is reloaded while the page stays open.
    fail({ code: 'NO_RECEIVER', message: '扩展已更新，请刷新页面后再试。', retryable: false });
    return () => {};
  }

  port.onMessage.addListener((raw: unknown) => {
    if (finished) return;
    const parsed = portEventSchema.safeParse(raw);
    if (!parsed.success) return;
    const event = parsed.data;
    resetIdle();
    if (event.type === 'chunk') {
      buffer += event.text;
      handlers.onChunk(buffer);
    } else if (event.type === 'done') {
      finish();
      handlers.onDone(event.data);
      port?.disconnect();
    } else {
      fail(event.error);
      port?.disconnect();
    }
  });

  port.onDisconnect.addListener(() => {
    fail({ code: 'NO_RECEIVER', message: '和扩展后台的连接断开了，请重试。', retryable: true });
  });

  resetIdle();
  port.postMessage({ type: 'translate', text });

  return () => {
    if (finished) return;
    finish();
    port?.disconnect();
  };
}
