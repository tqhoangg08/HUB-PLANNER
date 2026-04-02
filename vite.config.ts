import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script', // 👈 CÚ CHỐT CHỮA BỆNH SW: Ép Vite bơm thẳng script ra HTML cho Bot nó đọc
      devOptions: {
        enabled: true 
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5000000
      },
      manifest: {
        id: "/",
        short_name: "HUB Planner",
        name: "HUB Planner - Hỗ trợ sinh viên",
        description: "Ứng dụng hỗ trợ học tập, quản lý lộ trình và thời khóa biểu cho sinh viên HUB",
        orientation: "portrait",
        dir: "ltr", // 👈 Fix: Xác định hướng chữ trái sang phải
        start_url: "/",
        
        // 👈 Fix: Thêm "tabbed" để cho phép mở nhiều tab trong PWA
        display_override: ["window-controls-overlay", "tabbed", "standalone"],
        display: "standalone",
        theme_color: "#003375",
        background_color: "#F8FAFC",
        
        categories: ["education", "productivity", "utilities"],
        iarc_rating_id: "e84b072d-71b3-4d3e-86ae-31a8ce4e53b7",
        prefer_related_applications: false,
        
        // 👈 Fix: Khai báo 1 cái ID giả định để bot không la làng
        related_applications: [
          {
            platform: "play",
            url: "https://hotrosinhvienhub.id.vn",
            id: "vn.id.hotrosinhvienhub.app" 
          }
        ],

        // 👈 Fix: Cho phép app mở rộng ra các subdomain (vd: admin.hotrosinhvienhub.id.vn)
        scope_extensions: [
          { origin: "*.hotrosinhvienhub.id.vn" }
        ],
        
        launch_handler: {
          client_mode: "focus-existing"
        },
        shortcuts: [
          {
            name: "Thời khóa biểu",
            short_name: "Lịch học",
            description: "Xem thời khóa biểu hôm nay",
            url: "/schedule",
            icons: [{ src: "/logo192.png", sizes: "192x192" }]
          },
          {
            name: "Tìm đồ thất lạc",
            short_name: "Tìm đồ",
            url: "/lost-found",
            icons: [{ src: "/logo192.png", sizes: "192x192" }]
          }
        ],
        share_target: {
          action: "/dashboard",
          method: "GET",
          params: { title: "title", text: "text", url: "url" }
        },
        file_handlers: [
          {
            action: "/",
            accept: { "application/pdf": [".pdf"] }
          }
        ],
        protocol_handlers: [
          { protocol: "web+hubplanner", url: "/?link=%s" }
        ],
        widgets: [
          {
            name: "HUB Planner Widget",
            description: "Xem nhanh lịch học",
            tag: "hub_planner_widget",
            ms_ac_holographic_extension: "/"
          }
        ],
        edge_side_panel: {
          preferred_width: 400
        },
        note_taking: {
          new_note_url: "/handbook"
        },
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
        ]
      } as any
    })
  ],
  server: {
    port: 3000,
  },
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