import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the React app proxies /api to the Express server.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
  test: { environment: 'jsdom', setupFiles: ['./tests/setup.js'], css: false },
});
