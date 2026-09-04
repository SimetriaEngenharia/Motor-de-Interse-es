import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Fonte única: app/src. O index.html da raiz é a porta de entrada do Vite;
// Simetria.dc.html + app/loader.js são a porta do Omelette. Ver AGENTS.md.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.API_KEY || ''),
    },
    server: { host: true, port: 3000 },
    build: { outDir: 'dist', chunkSizeWarningLimit: 2500 },
  };
});
