import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'icons/apple-touch-icon.png',
        'icons/pwa-192.png',
        'icons/pwa-512.png',
        'icons/pwa-maskable-512.png',
      ],
      manifest: {
        name: 'Porodično stablo',
        short_name: 'Stablo',
        lang: 'sr',
        start_url: '/',
        display: 'standalone',
        theme_color: '#1d3557',
        background_color: '#f5ebe0',
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Fontovi (woff2) ulaze u precache da bi brend tipografija radila i offline.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // /api/* nikad ne sme da padne na SPA shell.
        navigateFallbackDenylist: [/^\/api\//],
        // VAŽNO: /api/auth se NIKAD ne kešira — obrasci ispod ga ne hvataju.
        runtimeCaching: [
          {
            urlPattern: /\/api\/photos\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'photos',
              expiration: { maxEntries: 500, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /\/api\/(tree|persons)/,
            handler: 'NetworkFirst',
            options: { cacheName: 'api', networkTimeoutSeconds: 3 },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../shared/src', import.meta.url)),
    },
  },
  server: {
    proxy: { '/api': 'http://localhost:3001' },
  },
});
