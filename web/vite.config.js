import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In a Codespace the browser reaches Vite through a forwarded HTTPS host, not localhost.
const inCodespace = Boolean(process.env.CODESPACE_NAME);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,                                   // listen on 0.0.0.0 so the port can be forwarded
    allowedHosts: inCodespace ? ['.app.github.dev'] : undefined,
    hmr: inCodespace ? { clientPort: 443 } : undefined,
    proxy: { '/api': 'http://localhost:4000' },   // the frontend calls /api; this hands it to the API
  },
});
