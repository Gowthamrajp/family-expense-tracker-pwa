/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // vite-plugin-pwa generates the Web App Manifest (Req 5.1) and a Workbox
    // precaching service worker for the application shell (Req 5.5). It also
    // provides the `virtual:pwa-register` module used by src/pwa.ts (Req 5.2).
    VitePWA({
      registerType: 'autoUpdate',
      // The service worker is generated as part of the production build. During
      // dev and test we keep it disabled so it does not interfere with the
      // Vitest/jsdom environment.
      devOptions: {
        enabled: false,
      },
      includeAssets: ['pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'Family Expense Tracker',
        short_name: 'Expenses',
        description:
          'Record family expenses and view spending through a visual dashboard.',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: '#1e3a5f',
        background_color: '#ffffff',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the built application shell assets (Req 5.5).
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
