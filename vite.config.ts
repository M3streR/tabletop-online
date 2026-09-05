import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

declare const process: { argv: string[] }

export default defineConfig({
  // GitHub Pages serves this project below /tabletop-online/.
  // Local and Sites builds stay rooted at /.
  base: process.argv.includes('github-pages') ? '/tabletop-online/' : '/',
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
