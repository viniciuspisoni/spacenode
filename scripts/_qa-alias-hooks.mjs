// scripts/_qa-alias-hooks.mjs
//
// Loader de RESOLUÇÃO só-de-QA (não é código de produto): resolve os specifiers
// `@/...` (alias do tsconfig) e imports relativos sem extensão para os arquivos
// .ts reais, para que os testes em Node consigam importar os módulos de
// lib/marketing/* e lib/gemini.ts sem o bundler do Next. O type-stripping nativo
// do Node 24 cuida do resto. Registrado via scripts/_qa-alias-register.mjs.

import { existsSync, statSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = process.cwd()
const CANDS = ['', '.ts', '.tsx', '.js', '.mjs', path.sep + 'index.ts']

// O candidato '' também casa com DIRETÓRIO (ex.: lib/nodi/knowledge) e o Node
// explode com EISDIR ao carregar — só vale candidato que seja ARQUIVO; o
// diretório cai no candidato /index.ts mais adiante.
const isFile = (p) => {
  try { return statSync(p).isFile() } catch { return false }
}

export async function resolve(spec, ctx, next) {
  let base = null
  if (spec.startsWith('@/')) {
    base = path.join(root, spec.slice(2))
  } else if ((spec.startsWith('./') || spec.startsWith('../')) && /\.tsx?$/.test(ctx.parentURL ?? '')) {
    base = fileURLToPath(new URL(spec, ctx.parentURL))
  }
  if (base) {
    for (const ext of CANDS) {
      const p = base + ext
      if (existsSync(p) && isFile(p)) return { url: pathToFileURL(p).href, shortCircuit: true }
    }
  }
  return next(spec, ctx)
}
