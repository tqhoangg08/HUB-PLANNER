import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000, // Giữ cố định cổng 3000 cho khớp với Supabase
  },
  build: {
    target: "esnext", // QUAN TRỌNG: Dòng này sửa lỗi màn hình đỏ
  },
  esbuild: {
    target: "esnext", // QUAN TRỌNG: Cho phép chạy code mới nhất
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
})
