import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Aitra',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    permissions: ['storage', 'contextMenus'],
    host_permissions: [
      'https://api.deepseek.com/*',
      'https://api.openai.com/*',
      'https://api.deepl.com/*',
      'https://api-free.deepl.com/*',
    ],
    // Custom OpenAI-compatible endpoints are granted one origin at a time
    // from the options page.
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    commands: {
      'translate-selection': {
        suggested_key: { default: 'Alt+T' },
        description: '__MSG_commandTranslate__',
      },
    },
  },
});
