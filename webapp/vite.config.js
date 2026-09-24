import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],

  base: '/analisirefertogara/',

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
