import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Sửa tham số thứ 3 từ '' thành 'VITE_' để an toàn hơn (chỉ load biến VITE_ vào config)
  const env = loadEnv(mode, process.cwd(), 'VITE_'); 

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    
    // 👇👇👇 THÊM ĐOẠN NÀY ĐỂ BẢO MẬT 👇👇👇
    // Chỉ cho phép những biến bắt đầu bằng các từ khóa này được lọt xuống Client
    // Các biến rác như VITE_VERCEL_GIT... sẽ bị chặn lại vì không nằm trong danh sách này.
    envPrefix: ['VITE_GEMINI', 'VITE_SUPABASE'], 
    // 👆👆👆 HẾT PHẦN QUAN TRỌNG 👆👆👆

    build: {
      target: "esnext",
      sourcemap: false,
      minify: 'esbuild',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
