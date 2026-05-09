import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.VITE_PWA_BASE || '/'

export default defineConfig({
    base,
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            manifest: {
                name: 'Pocket Vibe',
                short_name: 'Pocket Vibe',
                description: 'Mobile control layer for desktop AI coding sessions',
                theme_color: '#0f172a',
                start_url: base,
                scope: base,
                icons: [
                    {
                        src: 'pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    }
                ]
            }
        })
    ],
    server: {
        host: true,
        port: 5173
    }
})
