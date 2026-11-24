import { defineConfig } from 'vite';

const SERVER = `http://localhost:${process.env.PORT ?? 8787}`;

export default defineConfig({
  root: 'client',
  publicDir: false,
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  server: {
    port: 5173,
    proxy: {
      '/api': SERVER,
      '/ws': { target: SERVER.replace('http', 'ws'), ws: true },
    },
  },
});
