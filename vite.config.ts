import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  // 👇 Di chuyển esbuild ra đây (Top-level)
  esbuild: {
    drop: ['console', 'debugger'],
  },
  optimizeDeps: {
    exclude: ['pdfjs-dist'],
    esbuildOptions: {
      target: "esnext",
      supported: {
        'top-level-await': true
      },
    },
  },
  build: {
    target: "esnext",
    sourcemap: false,
  },
})