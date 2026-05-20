import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replaceAll('\\', '/')
          if (!normalized.includes('/node_modules/')) return undefined
          if (normalized.includes('/@tiptap/')) return 'vendor-tiptap'
          if (normalized.includes('/@xterm/')) return 'vendor-terminal'
          if (normalized.includes('/@novnc/novnc/')) return 'vendor-remote'
          if (normalized.includes('/react-force-graph-2d/') || normalized.includes('/force-graph/')) return 'vendor-graph'
          if (normalized.includes('/@phosphor-icons/')) return 'vendor-icons'
          if (normalized.includes('/react/') || normalized.includes('/react-dom/') || normalized.includes('/react-router-dom/')) {
            return 'vendor-react'
          }
          return undefined
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    restoreMocks: true,
  },
})
