import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import svgr from 'vite-plugin-svgr'
// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react({
        babel: {
          plugins: [['babel-plugin-react-compiler']],
        },
      }),
      svgr(),
      tailwindcss(),
    ],
    build: {
      rollupOptions: {
        external: ['graphql', 'headers-polyfill'],
      },
    },
    server: {
      host: true, // Listen on all addresses for Docker
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    preview: {
      host: true,
      port: 5173,
      strictPort: true,
    },
  }
})
