import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg'],
      manifest: {
        name: 'Audire — Your Reading App',
        short_name: 'Audire',
        description: 'PDF & EPUB reader with natural TTS. Your personal reading sanctuary.',
        start_url: './',
        display: 'standalone',
        orientation: 'portrait-primary',
        theme_color: '#101622',
        background_color: '#101622',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
        categories: ['books', 'education', 'productivity'],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  optimizeDeps: {},
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('pdfjs-dist')) return 'vendor-pdf';
          if (id.includes('tesseract.js')) return 'vendor-ocr';
          if (id.includes('react-router-dom')) return 'vendor-router';
          if (id.includes('react') || id.includes('react-dom')) return 'vendor-react';
          if (id.includes('jszip')) return 'vendor-zip';
          return 'vendor-misc';
        },
      },
    },
  },
});
