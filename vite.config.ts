import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'CarlZen Chess',
        short_name: 'CarlZen',
        description: 'A chess coaching workspace with Stockfish analysis, AI summaries, and synced study sessions.',
        id: '/',
        start_url: '/',
        scope: '/',
        lang: 'en',
        theme_color: '#0d1320',
        background_color: '#0d1320',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        orientation: 'portrait',
        categories: ['games', 'education', 'productivity'],
        prefer_related_applications: false,
        icons: [
          {
            src: '/pwa-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        shortcuts: [
          {
            name: 'Open CarlZen',
            short_name: 'Open',
            description: 'Jump straight into your current analysis session.',
            url: '/'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024
      }
    })
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
