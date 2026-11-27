import { normalizeError } from '../errors';
import type { TranslateHandlers } from '../messaging/translate-client';
import type { Settings } from '../storage/settings';
import { translateWithBuiltin } from './translator';

/**
 * Same shape as requestTranslation(), but runs Chrome's on-device translator
 * right here in the page instead of going through the background.
 */
export function requestBuiltinTranslation(
  text: string,
  settings: Pick<Settings, 'targetLang' | 'fallbackLang'>,
  handlers: TranslateHandlers & { onDownload?: (fraction: number) => void },
): () => void {
  const controller = new AbortController();
  let done = false;

  translateWithBuiltin(text, settings, {
    signal: controller.signal,
    onDownload: (fraction) => {
      if (!done) handlers.onDownload?.(fraction);
    },
  })
    .then((data) => {
      if (done) return;
      done = true;
      handlers.onDone(data);
    })
    .catch((err: unknown) => {
      if (done) return;
      done = true;
      const error = normalizeError(err);
      if (error.code !== 'CANCELLED') handlers.onError(error.toInfo());
    });

  return () => {
    if (done) return;
    done = true;
    controller.abort();
  };
}
