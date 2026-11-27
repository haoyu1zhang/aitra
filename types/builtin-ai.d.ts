// Chrome's built-in AI translation APIs (Chrome 138+, desktop only).
// https://developer.chrome.com/docs/ai/translator-api

type AIAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface AIDownloadProgressEvent extends Event {
  /** Fraction between 0 and 1. */
  loaded: number;
}

interface AICreateMonitor extends EventTarget {
  addEventListener(type: 'downloadprogress', listener: (event: AIDownloadProgressEvent) => void): void;
}

interface AICreateOptions {
  signal?: AbortSignal;
  monitor?: (monitor: AICreateMonitor) => void;
}

interface TranslatorLanguages {
  sourceLanguage: string;
  targetLanguage: string;
}

interface Translator {
  translate(input: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy(): void;
}

declare var Translator: {
  availability(options: TranslatorLanguages): Promise<AIAvailability>;
  create(options: TranslatorLanguages & AICreateOptions): Promise<Translator>;
} | undefined;

interface LanguageDetectionResult {
  detectedLanguage: string;
  confidence: number;
}

interface LanguageDetector {
  detect(input: string, options?: { signal?: AbortSignal }): Promise<LanguageDetectionResult[]>;
  destroy(): void;
}

declare var LanguageDetector: {
  availability(): Promise<AIAvailability>;
  create(options?: AICreateOptions): Promise<LanguageDetector>;
} | undefined;
