import type { Browser } from 'wxt/browser';
import { TranslateError, normalizeError } from '../errors';
import {
  portRequestSchema,
  type PortEvent,
  type RuntimeRequest,
  type RuntimeResponse,
} from '../messaging/protocol';
import { hasEndpointPermission } from '../permissions';
import { CACHE_MAX, cacheCount, clearCache } from '../storage/cache';
import { activeApi, getSettings, type Settings } from '../storage/settings';
import { translateText } from '../translation/service';

const checkPermission = (settings: Settings) => {
  const api = activeApi(settings);
  return api ? hasEndpointPermission(api.baseUrl) : Promise.resolve(true);
};

function logFailure(code: string, length: number) {
  // Never log the selected text or anything from the settings.
  console.warn(`[aitra] translation failed: ${code} (${length} chars)`);
}

export function handleTranslatePort(port: Browser.runtime.Port) {
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
      send({ type: 'error', error: new TranslateError('BAD_RESPONSE', { key: 'detail.badRequest' }).toInfo() });
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

export async function handleRuntime(request: RuntimeRequest): Promise<RuntimeResponse<unknown>> {
  switch (request.type) {
    case 'provider:test': {
      const started = Date.now();
      try {
        // Stream like a real translation and report time to the first chunk,
        // which is what the user actually waits for on the page.
        const data = await translateText('The weather is nice today, so we are going for a walk.', { ...request.settings, targetLang: 'zh-CN', fallbackLang: 'en' }, {
          signal: AbortSignal.timeout(25_000),
          useCache: false,
          retries: 0,
          hasPermission: checkPermission,
          timeouts: { firstResponseMs: 20_000, totalMs: 20_000 },
          onChunk: () => {},
        });
        return { ok: true, data: { elapsedMs: data.firstChunkMs ?? Date.now() - started } };
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
