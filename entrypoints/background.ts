import { browser, type Browser } from 'wxt/browser';
import { TranslateError, normalizeError } from '@/lib/errors';
import {
  TRANSLATE_PORT,
  portRequestSchema,
  runtimeRequestSchema,
  type PortEvent,
  type RuntimeRequest,
  type RuntimeResponse,
  type TriggerMessage,
} from '@/lib/messaging/protocol';
import { hasEndpointPermission } from '@/lib/permissions';
import { CACHE_MAX, cacheCount, clearCache } from '@/lib/storage/cache';
import { getSettings, type Settings } from '@/lib/storage/settings';
import { translateText } from '@/lib/translation/service';

const MENU_ID = 'aitra-translate-selection';

const checkPermission = (settings: Settings) => hasEndpointPermission(settings.openai.baseUrl);

function logFailure(code: string, length: number) {
  // Never log the selected text or anything from the settings.
  console.warn(`[aitra] translation failed: ${code} (${length} chars)`);
}

function handleTranslatePort(port: Browser.runtime.Port) {
  const controller = new AbortController();
  let open = true;

  port.onDisconnect.addListener(() => {
    open = false;
    controller.abort(new TranslateError('CANCELLED'));
  });

  const send = (event: PortEvent) => {
    if (!open) return;
    try {
      port.postMessage(event);
    } catch {
      open = false;
    }
  };

  port.onMessage.addListener(async (raw: unknown) => {
    const parsed = portRequestSchema.safeParse(raw);
    if (!parsed.success) {
      send({ type: 'error', error: new TranslateError('BAD_RESPONSE', '请求格式不正确').toInfo() });
      return;
    }
    const { text } = parsed.data;
    try {
      const settings = await getSettings();
      const data = await translateText(text, settings, {
        signal: controller.signal,
        onChunk: (delta) => send({ type: 'chunk', text: delta }),
        hasPermission: checkPermission,
      });
      send({ type: 'done', data });
    } catch (err) {
      const error = normalizeError(err);
      if (error.code === 'CANCELLED') return;
      logFailure(error.code, text.length);
      send({ type: 'error', error: error.toInfo() });
    }
  });
}

async function handleRuntime(request: RuntimeRequest): Promise<RuntimeResponse<unknown>> {
  switch (request.type) {
    case 'provider:test': {
      const started = Date.now();
      try {
        const data = await translateText('Hello, world.', { ...request.settings, targetLang: 'zh-CN', fallbackLang: 'en' }, {
          signal: AbortSignal.timeout(25_000),
          useCache: false,
          retries: 0,
          hasPermission: checkPermission,
          timeouts: { firstResponseMs: 20_000, totalMs: 20_000 },
        });
        return { ok: true, data: { sample: data.translated, elapsedMs: Date.now() - started } };
      } catch (err) {
        const error = normalizeError(err);
        logFailure(error.code, 0);
        return { ok: false, error: error.toInfo() };
      }
    }
    case 'cache:stats':
      return { ok: true, data: { count: await cacheCount(), max: CACHE_MAX } };
    case 'cache:clear':
      await clearCache();
      return { ok: true, data: { count: 0, max: CACHE_MAX } };
  }
}

async function triggerInTab(tabId: number | undefined, message: TriggerMessage) {
  if (tabId === undefined || tabId < 0) return;
  try {
    // frameId 0: the content script only runs in the top frame.
    await browser.tabs.sendMessage(tabId, message, { frameId: 0 });
  } catch {
    // chrome:// pages, the Web Store, PDFs, or tabs opened before install.
    console.warn('[aitra] no content script in this tab');
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.removeAll(() => {
      browser.contextMenus.create({
        id: MENU_ID,
        title: '翻译选中内容',
        contexts: ['selection'],
      });
    });
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_ID) return;
    void triggerInTab(tab?.id, {
      type: 'trigger',
      origin: 'contextMenu',
      fallbackText: info.selectionText,
    });
  });

  browser.commands.onCommand.addListener((command, tab) => {
    if (command !== 'translate-selection') return;
    void triggerInTab(tab?.id, { type: 'trigger', origin: 'command' });
  });

  browser.runtime.onConnect.addListener((port) => {
    if (port.name === TRANSLATE_PORT) handleTranslatePort(port);
  });

  browser.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
    // Settings tests and cache management only come from extension pages.
    if (!sender.url?.startsWith(browser.runtime.getURL('/'))) return;
    const parsed = runtimeRequestSchema.safeParse(raw);
    if (!parsed.success) return;
    handleRuntime(parsed.data)
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, error: new TranslateError('UNKNOWN').toInfo() }));
    return true;
  });
});
