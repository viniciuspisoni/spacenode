// Config mínima do vitest (primeiro framework de teste do repo, criado junto
// com o Nodi). Ambiente node, alias "@" igual ao tsconfig. Testes moram em
// tests/** — rodar com `npm test`.

import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
