import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const siteUrl = (process.env.VITE_SITE_URL || env.VITE_SITE_URL || 'https://napo.github.io/analisirefertogara/').replace(/\/?$/, '/')

  return {
    plugins: [
      react(),
      {
        name: 'social-preview-url',
        transformIndexHtml: {
          order: 'pre',
          handler: html => html.replaceAll('%VITE_SITE_URL%', siteUrl),
        },
      },
    ],
    base: process.env.VITE_BASE_PATH || env.VITE_BASE_PATH || '/',
    optimizeDeps: {
      exclude: ['pdfjs-dist'],
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      watch: { ignored: ['**/src-tauri/**'] },
      allowedHosts: true,
    },
    preview: {
      host: '0.0.0.0',
      port: 3000,
    },
  }
})
