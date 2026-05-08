import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  },
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  build: {
    target: 'esnext',
    rollupOptions: {
      external: [/^@tauri-apps\//],
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-router')) return 'react'
          if (id.includes('node_modules/@tanstack')) return 'query'
          if (id.includes('node_modules/lucide-react')) return 'icons'
          if (id.includes('node_modules/@xterm')) return 'xterm'
        },
      },
    },
  },
  envPrefix: 'VITE_'
})
