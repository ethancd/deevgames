import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Relative base so the build is portable to Cloudflare Pages / Vercel
// (root deploy) or a sub-path (e.g. GitHub Pages) without reconfiguration.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      // All content is local data, so we can precache the whole shell for
      // a true offline-first experience ("add to home screen" works on iOS).
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        navigateFallback: 'index.html',
      },
      manifest: {
        name: 'Might & Magic: Spire',
        short_name: 'Spire',
        description: 'A roguelite deckbuilder on HoMM3 content.',
        theme_color: '#0b0d0a',
        background_color: '#0b0d0a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  server: {
    port: 3003,
    host: true,
  },
})
