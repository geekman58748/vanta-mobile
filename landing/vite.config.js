import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The wallet app runs on :3000, so the marketing site takes :3002.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 3002 },
  preview: { port: 3002 },
})
