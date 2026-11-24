import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// Builds demo/index.html into one self-contained HTML file.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: { alias: { '@': root } },
  build: { outDir: `${root}/.output/demo`, emptyOutDir: true },
});
