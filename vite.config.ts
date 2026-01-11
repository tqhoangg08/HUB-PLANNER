import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
     build: {
      target: "esnext",
      sourcemap: false, // <--- Dòng này tắt file .map
      minify: 'esbuild', // Nén code thành 1 cục dính chùm khó đọc
    },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
