import { TranslateError } from '../errors';
import { activeApi, type Settings } from '../storage/settings';
import { storageHints } from '../storage/thinking-hints';
import { DeepLProvider } from './deepl';
import { MockProvider } from './mock';
import { OpenAICompatibleProvider } from './openai';
import type { TranslationProvider } from './types';

export function createProvider(settings: Settings): TranslationProvider {
  switch (settings.provider) {
    case 'openai': {
      const api = activeApi(settings);
      if (!api) throw new TranslateError('BAD_CONFIG', '请先在设置页添加一个 AI 接口');
      return new OpenAICompatibleProvider(api, undefined, storageHints);
    }
    case 'deepl':
      return new DeepLProvider(settings.deepl.apiKey);
    case 'mock':
      return new MockProvider();
  }
}
