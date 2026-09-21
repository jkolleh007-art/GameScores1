import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    // GameScores has its own /ws gateway. Disable Vite's HMR WebSocket so
    // hosted previews/proxies cannot produce "[vite] failed to connect to websocket".
    hmr: false,
    watch: null,
  },
}));
