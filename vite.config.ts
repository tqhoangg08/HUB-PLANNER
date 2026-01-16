import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  optimizeDeps: {
    // 1. Dòng này giúp bỏ qua việc xử lý file PDF gây lỗi
    exclude: ['pdfjs-dist'], 
    
    // 2. Vẫn giữ cấu hình hỗ trợ code mới
    esbuildOptions: {
      target: "esnext",
      supported: { 
        'top-level-await': true 
      },
    },
  },
  build: {
    target: "esnext",
  },
})
