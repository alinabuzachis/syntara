import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import svgr from 'vite-plugin-svgr'
// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const proxyConfig = {
    '/api': {
      target: env.VITE_API_URL || 'http://localhost:3000',
      changeOrigin: true,
      secure: false,
    },
    '/ws': {
      target: env.VITE_WS_URL || env.VITE_API_URL || 'http://localhost:3000',
      changeOrigin: true,
      secure: false,
      ws: true,
    },
  }

  return {
    plugins: [
      react({
        babel: {
          plugins: [['babel-plugin-react-compiler']],
        },
      }),
      svgr(),
    ],
    build: {
      rollupOptions: {
        external: ['graphql', 'headers-polyfill'],
      },
    },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      proxy: proxyConfig,
    },
    preview: {
      host: true,
      port: 5173,
      strictPort: true,
      proxy: proxyConfig,
    },
  }
})
