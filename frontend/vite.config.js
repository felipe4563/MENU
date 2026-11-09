import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Con VITE_API_URL relativa (/api/v1, build de producción) la API vive en
  // el mismo dominio que la app, sea cual sea el restaurante.
  const apiBase = (env.VITE_API_URL ?? 'http://localhost:3001/api/v1').replace('/api/v1', '');
  const origenApi = apiBase || 'https?://[^/]+';

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        devOptions: { enabled: false },
        includeAssets: ['favicon.svg', 'favicon.png', 'icons/*.png', 'icons/icon.svg'],
        // El manifest no sale del build: lo arma el backend con el nombre y el
        // logo de cada restaurante (ver index.html y backend/src/modules/pwa).
        manifest: false,
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api/, /^\/uploads/, /^\/socket\.io/, /^\/webhooks/],
          runtimeCaching: [
            {
              urlPattern: new RegExp(`^${origenApi}/uploads/`),
              handler: 'CacheFirst',
              options: {
                cacheName: 'uploads',
                expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Solo lecturas del catálogo: si se cae el internet la pantalla
              // de venta sigue mostrando productos y mesas.
              urlPattern: ({ url, request }) => request.method === 'GET'
                && /\/api\/v1\/(productos|categorias|combos\/activos|promociones\/activas|mesas|areas|configuracion)/.test(url.pathname),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'catalogo',
                networkTimeoutSeconds: 6,
                expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    // En desarrollo el manifest y los íconos se piden al backend como si
    // fuera el mismo dominio (en producción lo hace nginx).
    server: { host: true, port: 5173, proxy: { '/api/v1/pwa': 'http://localhost:3001' } },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            datos: ['@tanstack/react-query', 'axios', 'zustand', 'socket.io-client'],
            graficos: ['recharts'],
            pdf: ['jspdf', 'jspdf-autotable'],
          },
        },
      },
    },
  };
});
