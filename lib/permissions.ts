import { browser } from 'wxt/browser';
import { endpointOrigin } from './storage/settings';

// Keep in sync with host_permissions in wxt.config.ts.
const BUILT_IN_ORIGINS = new Set([
  'https://api.deepseek.com',
  'https://api.openai.com',
  'https://api.deepl.com',
  'https://api-free.deepl.com',
]);

export function originPattern(origin: string): string {
  return `${origin}/*`;
}

export function isBuiltInOrigin(origin: string): boolean {
  return BUILT_IN_ORIGINS.has(origin);
}

export async function hasEndpointPermission(baseUrl: string): Promise<boolean> {
  const origin = endpointOrigin(baseUrl);
  if (!origin) return false;
  if (isBuiltInOrigin(origin)) return true;
  return browser.permissions.contains({ origins: [originPattern(origin)] });
}

/**
 * Must be called directly from a user gesture (click handler) without any
 * await before it, otherwise Chrome rejects the request.
 */
export function requestEndpointPermission(baseUrl: string): Promise<boolean> {
  const origin = endpointOrigin(baseUrl);
  if (!origin) return Promise.resolve(false);
  if (isBuiltInOrigin(origin)) return Promise.resolve(true);
  return browser.permissions.request({ origins: [originPattern(origin)] });
}
