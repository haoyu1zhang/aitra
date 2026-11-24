import type { Settings } from '../storage/settings';
import { DeepLProvider } from './deepl';
import { MockProvider } from './mock';
import { OpenAICompatibleProvider } from './openai';
import type { TranslationProvider } from './types';

export function createProvider(settings: Settings): TranslationProvider {
  switch (settings.provider) {
    case 'openai':
      return new OpenAICompatibleProvider(settings.openai);
    case 'deepl':
      return new DeepLProvider(settings.deepl.apiKey);
    case 'mock':
      return new MockProvider();
  }
}
