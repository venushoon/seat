import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages용 base 설정
const repo = 'seat'

export default defineConfig({
  base: `/${repo}/`,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/maskable-512.png'
      ],
      manifest: {
        name: '자리배치 · 모둠편성',
        short_name: '모둠편성',
        description: '교실용 자리배치(모둠편성) 도구',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        lang: 'ko',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
})
