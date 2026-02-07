import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw-push.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
      },
      includeAssets: ['deepstock.svg', 'favicon-192x192.png', 'favicon-512x512.png'],
      manifest: {
        name: 'DeepStock',
        short_name: 'DeepStock',
        description: 'Portfolio tracker a analýza investic',
        theme_color: '#18181b',
        background_color: '#09090b',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'favicon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'favicon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'favicon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: {
        enabled: false, // Disable in dev, enable for testing
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
