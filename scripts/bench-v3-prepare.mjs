// Copia os prints do manifesto da bancada 3.0 para tests/fidelity/bench/inputs/
// (pasta no .gitignore). O prefixo interior-/exterior- define o projectType.
import { copyFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { extname, join } from 'node:path'

const root = process.cwd()
const manifest = JSON.parse(readFileSync(join(root, 'tests/fidelity/bench/v3-manifest.json'), 'utf8'))
const out = join(root, 'tests/fidelity/bench/inputs')
mkdirSync(out, { recursive: true })
let copied = 0
for (const c of manifest.cases) {
  const src = join(root, c.source)
  if (!existsSync(src)) { console.error(`faltando: ${c.source}`); process.exitCode = 1; continue }
  copyFileSync(src, join(out, `${c.type}-${c.id}${extname(src).toLowerCase()}`))
  copied++
}
console.log(`${copied}/${manifest.cases.length} prints em ${out}`)
console.log(`faltam ${manifest.missing.length} grupos para completar 40:`)
for (const m of manifest.missing) console.log(`  - ${m}`)
