import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// The API server runs separately (default http://localhost:8787). In dev we proxy /api to it
// so the browser sees a single origin and cookies work without CORS gymnastics.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Untis⁺',
        short_name: 'Untis⁺',
        description: 'A faster, friendlier WebUntis client for students and teachers.',
        theme_color: '#4f46e5',
        background_color: '#0b1020',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          {
            name: 'Heute',
            short_name: 'Heute',
            description: 'Tagesplan & aktuelle Vertretungen',
            url: '/#/today',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Stundenplan',
            short_name: 'Plan',
            description: 'Wochenübersicht des Stundenplans',
            url: '/#/timetable',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Vertretungen',
            short_name: 'Vertretung',
            description: 'Aktuelle Entfälle und Raumänderungen',
            url: '/#/substitutions',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Raumfinder',
            short_name: 'Räume',
            description: 'Freie Räume jetzt finden',
            url: '/#/rooms',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Prüfungen',
            short_name: 'Prüfungen',
            description: 'Schularbeiten und Notenrechner',
            url: '/#/exams',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Last-known timetable/master data when offline.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'untisplus-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.API_URL ?? 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.API_URL ?? 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/');
          if (normalized.includes('node_modules')) {
            if (
              normalized.includes('lucide') ||
              normalized.includes('@lucide') ||
              normalized.includes('react-icons') ||
              normalized.includes('heroicons')
            ) {
              return 'icons';
            }
            if (normalized.includes('i18next') || normalized.includes('react-i18next')) {
              return 'i18n';
            }
            if (
              normalized.includes('/react/') ||
              normalized.includes('/react-dom/') ||
              normalized.includes('/scheduler/')
            ) {
              return 'react';
            }
            return 'vendor';
          }
        },
      },
    },
  },
});
