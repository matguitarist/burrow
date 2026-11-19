import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // React changes far less often than the app: its own file stays cached across updates
      output: { manualChunks: { react: ['react', 'react-dom'] } },
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/ws':  { target: 'ws://localhost:3001',   ws: true },
    },
  },
})
