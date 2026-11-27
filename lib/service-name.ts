import type { Translator } from './i18n';
import { providerLabel, type Settings } from './storage/settings';

/** Human-readable name of the selected service, in the UI language. */
export function serviceName(settings: Settings, t: Translator): string {
  if (settings.provider === 'builtin') return t('provider.builtin.title');
  return providerLabel(settings) || t('provider.none');
}
