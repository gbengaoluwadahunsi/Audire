import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function manualChunks(id) {
  if (!id.includes('node_modules')) return
  if (id.includes('pdfjs-dist')) return 'pdfjs'
  if (id.includes('epubjs')) return 'epub'
  if (id.includes('tesseract')) return 'tesseract'
  if (id.includes('pdf-lib')) return 'pdf-lib'
  if (id.includes('framer-motion')) return 'framer-motion'
  if (id.includes('lucide-react')) return 'lucide-icons'
  if (id.includes('dexie')) return 'dexie'
  if (id.includes('jszip')) return 'jszip'
  if (id.includes('react-dom')) return 'react-vendor'
  if (/[/\\]node_modules[/\\]react[/\\]/.test(id)) return 'react-vendor'
  if (id.includes('scheduler')) return 'react-vendor'
  // No catch-all bucket — avoids Rollup circular-chunk warnings; remaining deps use default splitting.
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {},
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
    chunkSizeWarningLimit: 1300,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },

})
