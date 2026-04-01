import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa' // 👈 Thêm import này

export default defineConfig({
  plugins: [
    react(),
    // 👈 Thêm nguyên cục VitePWA này vào
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true // Bật true để chạy được PWA trên localhost
      },
      manifest: {
        short_name: "HUB Planner",
        name: "HUB Planner - Hỗ trợ sinh viên",
        icons: [
          {
            src: "/logo192.png",
            type: "image/png",
            sizes: "192x192",
            purpose: "any"
          },
          {
            src: "/logo512.png",
            type: "image/png",
            sizes: "512x512",
            purpose: "any"
          }
        ],
        screenshots: [
          {
            src: "/screenshot-mobile.png",
            sizes: "1080x2400",
            type: "image/png",
            form_factor: "narrow"
          },
          {
            src: "/screenshot-desktop.png",
            sizes: "1920x1080",
            type: "image/png",
            form_factor: "wide"
          }
        ],
        start_url: "/", // Đổi "." thành "/" để tránh lỗi đường dẫn
        display: "standalone",
        theme_color: "#003375",
        background_color: "#F8FAFC"
      }
    })
  ],
  server: {
    port: 3000,
  },
  // 👇 Đống này của ông tôi giữ nguyên không đụng tới nha
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