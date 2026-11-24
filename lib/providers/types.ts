export interface TranslateOptions {
  targetLang: string;
  signal: AbortSignal;
  /** Called with each new piece of text when the provider can stream. */
  onChunk?: (delta: string) => void;
}

export interface TranslateResult {
  text: string;
  detectedSourceLang?: string;
}

export interface TranslationProvider {
  readonly label: string;
  translate(text: string, options: TranslateOptions): Promise<TranslateResult>;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
