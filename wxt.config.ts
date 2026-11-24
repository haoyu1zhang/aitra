import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Aitra',
    description: '划词翻译：选中网页文本即可用 AI 模型或 DeepL 翻译，结果显示在选区旁边。',
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
        description: '翻译当前选中的文本',
      },
    },
  },
});
