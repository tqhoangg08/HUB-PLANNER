import fs from 'node:fs'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const devApiPlugin = (): Plugin => ({
  name: 'hub-planner-dev-api',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use(async (req: any, res: any, next) => {
      const requestUrl = req.url || ''
      const parsedUrl = new URL(requestUrl, 'http://localhost')
      if (!parsedUrl.pathname.startsWith('/api/')) return next()

      const routeName = parsedUrl.pathname.replace(/^\/api\//, '').replace(/\/$/, '')
      const jsPath = `/api/${routeName}.js`
      const tsPath = `/api/${routeName}.ts`
      const modulePath = fs.existsSync(`${process.cwd()}${jsPath}`) ? jsPath : fs.existsSync(`${process.cwd()}${tsPath}`) ? tsPath : null

      if (!modulePath) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'API route not found' }))
        return
      }

      try {
        let rawBody = ''
        await new Promise<void>((resolve, reject) => {
          req.on('data', (chunk: Buffer) => {
            rawBody += chunk.toString()
          })
          req.on('end', resolve)
          req.on('error', reject)
        })

        const contentType = String(req.headers['content-type'] || '')
        req.query = Object.fromEntries(parsedUrl.searchParams.entries())
        req.body = contentType.includes('application/json') && rawBody ? JSON.parse(rawBody) : rawBody

        const response = {
          status(code: number) {
            res.statusCode = code
            return response
          },
          setHeader(name: string, value: string) {
            res.setHeader(name, value)
            return response
          },
          json(payload: unknown) {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(payload))
          },
          send(payload: unknown) {
            if (typeof payload === 'object') {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(payload))
              return
            }
            res.end(String(payload ?? ''))
          },
          end(payload?: unknown) {
            res.end(payload)
          },
        }

        const mod = await server.ssrLoadModule(modulePath)
        await mod.default(req, response)
      } catch (error: any) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: error.message || 'Local API error' }))
      }
    })
  },
})

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))

  return {
  plugins: [
    devApiPlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script', 
      devOptions: {
        enabled: true 
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5000000,
        importScripts: ['/hub-sw.js']
      },
      manifest: {
        id: "/",
        short_name: "HUB Planner",
        name: "HUB Planner - Hỗ trợ sinh viên",
        description: "Ứng dụng hỗ trợ học tập, quản lý lộ trình và thời khóa biểu cho sinh viên HUB",
        orientation: "portrait",
        dir: "ltr", 
        start_url: "/",
        
        display_override: ["window-controls-overlay", "tabbed", "standalone"],
        display: "standalone",
        theme_color: "#003375",
        background_color: "#003375",
        
        categories: ["education", "productivity", "utilities"],
        iarc_rating_id: "e84b072d-71b3-4d3e-86ae-31a8ce4e53b7",
        prefer_related_applications: false,
        
        related_applications: [
          {
            platform: "play",
            url: "https://hotrosinhvienhub.id.vn",
            id: "vn.id.hotrosinhvienhub.app" 
          }
        ],

        // 👈 ĐÃ FIX Ở ĐÂY: Thêm https:// và bỏ dấu *
        scope_extensions: [
          { origin: "https://hotrosinhvienhub.id.vn" }
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
          // 👈 ĐÃ FIX Ở ĐÂY: Khai báo rõ định dạng mã hóa để trình duyệt không nhắc nhở nữa
          enctype: "application/x-www-form-urlencoded",
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
}
})
