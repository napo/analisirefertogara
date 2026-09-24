import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const pdfWorkerPath = resolve(process.cwd(), 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs')
const pdfWorkerSource = () => readFileSync(pdfWorkerPath)

const pdfWorkerPlugin = {
  name: 'serve-pdf-worker',
  configureServer(server) {
    server.middlewares.use('/pdf.worker.min.mjs', (_request, response) => {
      response.setHeader('Content-Type', 'text/javascript')
      response.end(pdfWorkerSource())
    })
  },
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'pdf.worker.min.mjs',
      source: pdfWorkerSource(),
    })
  },
}

export default defineConfig({
  plugins: [react(), pdfWorkerPlugin],

  base: '/',

  optimizeDeps: {
    exclude: ['pdfjs-dist'],
  },

  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },

  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
})
