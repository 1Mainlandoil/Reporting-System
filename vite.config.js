import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// GitHub Pages project site: https://<org>.github.io/<repo>/ → set VITE_BASE_PATH=/Reporting-System/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'inject-html-base',
      transformIndexHtml(html) {
        const base = process.env.VITE_BASE_PATH || '/'
        if (html.includes('<base ')) {
          return html
        }
        return html.replace('<head>', `<head>\n    <base href="${base}" />`)
      },
    },
  ],
})
