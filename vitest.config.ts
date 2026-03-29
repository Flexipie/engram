import { defineConfig, type Plugin } from 'vitest/config'

function sqlPlugin(): Plugin {
  return {
    name: 'sql-loader',
    transform(code, id) {
      if (id.endsWith('.sql')) {
        return { code: `export default ${JSON.stringify(code)}` }
      }
    },
  }
}

export default defineConfig({
  plugins: [sqlPlugin()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['src/__tests__/e2e/**'],
    setupFiles: ['src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
})
