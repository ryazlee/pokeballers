import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const BASE = '/pokeballers/'

function redirectUnslashedBase(): Plugin {
  const withoutSlash = BASE.slice(0, -1)

  function middleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
    const url = req.url ?? '/'
    const pathname = url.split('?')[0]
    if (pathname !== withoutSlash) {
      next()
      return
    }

    const search = url.includes('?') ? url.slice(url.indexOf('?')) : ''
    res.statusCode = 302
    res.setHeader('Location', `${BASE}${search}`)
    res.end()
  }

  return {
    name: 'redirect-unslashed-base',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

export default defineConfig({
  base: BASE,
  plugins: [
    redirectUnslashedBase(),
    react(),
    tailwindcss(),
    {
      name: 'spa-fallback',
      closeBundle() {
        const indexPath = path.resolve('dist/index.html')
        fs.copyFileSync(indexPath, path.resolve('dist/404.html'))
      },
    },
  ],
})
