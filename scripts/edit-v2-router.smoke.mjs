#!/usr/bin/env node
// scripts/edit-v2-router.smoke.mjs
//
// Smoke GRATUITO da matriz de roteamento do Editar v2 (função pura — zero rede,
// zero custo). Compila lib/edit-v2 (subset puro) para um diretório temporário
// com o tsc do projeto e roda as asserções da política APROVADA em 2026-06-12:
//   Vertex  → fix_image / remove_element (com máscara, sem referência)
//   Gemini  → swap_material (sempre), insert_element (sempre), adjust_atmosphere
//   Pro     → alta precisão (16/30 nodes)
//
// Uso: node scripts/edit-v2-router.smoke.mjs

import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const ROOT = path.resolve(import.meta.dirname, '..')
const tmp = mkdtempSync(path.join(os.tmpdir(), 'editv2-router-'))
const outDir = path.join(tmp, 'out')

const tsconfig = {
  compilerOptions: {
    target: 'ES2022', module: 'commonjs', moduleResolution: 'node',
    esModuleInterop: true, skipLibCheck: true, strict: true,
    types: ['node'],
    typeRoots: [path.join(ROOT, 'node_modules', '@types')],
    outDir,
  },
  files: ['types.ts', 'flags.ts', 'pricing.ts', 'prompts.ts', 'router.ts']
    .map(f => path.join(ROOT, 'lib', 'edit-v2', f)),
}
writeFileSync(path.join(tmp, 'tsconfig.json'), JSON.stringify(tsconfig))

try {
  execSync(`npx tsc -p "${path.join(tmp, 'tsconfig.json')}"`, { cwd: ROOT, stdio: 'inherit' })
} catch {
  console.error('✖ compilação falhou'); rmSync(tmp, { recursive: true, force: true }); process.exit(1)
}

const require = createRequire(import.meta.url)
const { routeEditV2, validateEditRequestV2 } = require(path.join(outDir, 'router.js'))
const { resolveOutputResolution } = require(path.join(outDir, 'pricing.js'))

const FLAGS = { v2Enabled: true, vertexImagen: true, geminiEdit: true, normalizer: true, semanticGate: true, falFallback: false }
const NO_VERTEX = { ...FLAGS, vertexImagen: false }
const norm = { instructionEn: 'replace the floor with light oak wood', ambiguous: false, ambiguityNote: null, requiresStrictGeometry: false, referenceKindHint: null, used: true, durationMs: 0, costUsdEstimated: 0 }
const input = over => ({
  editIntent: 'swap_material', qualityMode: 'economic', preservationMode: 'maximum',
  intensityMode: 'standard', hasMask: true, maskAreaRatio: 0.18, hasReferenceImage: false,
  referenceKind: null, hasProjectContextImages: false, requiresStrictGeometry: false,
  outputResolution: 'source', imageMegapixels: 4.2, userPlan: 'pro', ...over,
})

let pass = 0, fail = 0
const check = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++ }
  else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`) }
}
const route = (over, flags = FLAGS, refs = []) =>
  routeEditV2({ input: input(over), normalized: norm, references: refs, flags })

// ── Vertex: só reconstrução (fix/remove) com máscara e sem referência ────────
let r = route({ editIntent: 'remove_element' })
check('remove → vertex 4', [r.selectedProvider, r.selectedModel, r.nodesCost], ['vertex-imagen', 'imagen-3.0-capability-001', 4])
check('remove fallback gemini', [r.retryPolicy.fallbackProvider, r.retryPolicy.fallbackModel], ['gemini-image', 'gemini-3.1-flash-image'])
r = route({ editIntent: 'fix_image' })
check('fix → vertex 3', [r.selectedProvider, r.nodesCost], ['vertex-imagen', 3])
r = route({ editIntent: 'remove_element' }, NO_VERTEX)
check('remove vertexOFF → gemini', [r.selectedProvider, r.nodesCost], ['gemini-image', 4])
r = route({ editIntent: 'fix_image', hasReferenceImage: true, referenceKind: 'context' }, FLAGS, [{ kind: 'context', url: 'https://x/c.jpg' }])
check('fix com referência → gemini', r.selectedProvider, 'gemini-image')

// ── Material: SEMPRE Gemini (evidência do mini-batch 2026-06-12) ─────────────
r = route({})
check('material s/ref+mask → GEMINI 5 (não Vertex)', [r.selectedProvider, r.selectedModel, r.nodesCost], ['gemini-image', 'gemini-3.1-flash-image', 5])
r = route({ hasReferenceImage: true, referenceKind: 'material' }, FLAGS, [{ kind: 'material', url: 'https://x/t.jpg' }])
check('material c/ref → gemini 6', [r.selectedProvider, r.nodesCost], ['gemini-image', 6])
r = route({ hasMask: false })
check('material sem máscara → gemini 5', [r.selectedProvider, r.nodesCost], ['gemini-image', 5])

// ── Inserir: SEMPRE Gemini (não validado no Vertex) ──────────────────────────
r = route({ editIntent: 'insert_element' })
check('insert s/ref → GEMINI 6 (não Vertex)', [r.selectedProvider, r.nodesCost], ['gemini-image', 6])
r = route({ editIntent: 'insert_element', hasReferenceImage: true, referenceKind: 'object' }, FLAGS, [{ kind: 'object', url: 'https://x/o.jpg' }])
check('insert c/ref → gemini 6', [r.selectedProvider, r.nodesCost], ['gemini-image', 6])

// ── Atmosfera e Alta precisão ────────────────────────────────────────────────
r = route({ editIntent: 'adjust_atmosphere', hasMask: false })
check('atmosfera → gemini 10 @2K', [r.selectedProvider, r.nodesCost, r.loggingData.resolvedResolution], ['gemini-image', 10, '2K'])
r = route({ qualityMode: 'high_precision' })
check('alta precisão → pro 16', [r.selectedModel, r.nodesCost], ['gemini-3-pro-image', 16])
r = route({ qualityMode: 'high_precision', outputResolution: '4K', imageMegapixels: 12 })
check('alta precisão 4K → 30', [r.selectedModel, r.nodesCost], ['gemini-3-pro-image', 30])
check('econômica capa 4K→2K', resolveOutputResolution({ outputResolution: '4K', imageMegapixels: 12, qualityMode: 'economic' }), '2K')

// ── Gates por preservação ────────────────────────────────────────────────────
r = route({ editIntent: 'remove_element', preservationMode: 'maximum' })
check('gate máxima/remove 5%', r.loggingData.gateThresholds.outOfMask, 0.05)
r = route({ preservationMode: 'maximum' })
check('gate máxima/material 10%', r.loggingData.gateThresholds.outOfMask, 0.1)
r = route({ editIntent: 'remove_element', preservationMode: 'standard' })
check('gate padrão/remove 10%', r.loggingData.gateThresholds.outOfMask, 0.1)

// ── Validações de produto ────────────────────────────────────────────────────
check('remove sem máscara → erro', validateEditRequestV2(input({ editIntent: 'remove_element', hasMask: false }), 'x'), 'Selecione a área da imagem antes de gerar.')
check('material sem texto/ref → erro', validateEditRequestV2(input({}), ' '), 'Descreva a alteração ou anexe uma referência.')
check('atmosfera com texto → ok', validateEditRequestV2(input({ editIntent: 'adjust_atmosphere', hasMask: false }), 'fim de tarde'), null)
check('seleção praticamente vazia → erro', validateEditRequestV2(input({ editIntent: 'remove_element', maskAreaRatio: 0.0001 }), 'x'), 'A seleção está praticamente vazia. Pinte a área que deseja editar.')
check('seleção pequena (0,1%) → PERMITE (aviso é da UI)', validateEditRequestV2(input({ editIntent: 'remove_element', maskAreaRatio: 0.001 }), 'x'), null)

// ── Prompt: âncoras essenciais ───────────────────────────────────────────────
r = route({ hasReferenceImage: true, referenceKind: 'material' }, FLAGS, [{ kind: 'material', url: 'https://x/t.jpg' }])
check('prompt: contrato de imagens', r.normalizedPrompt.includes('Image 1 is the MAIN architectural image'), true)
check('prompt: base obrigatório', r.normalizedPrompt.includes('Do not redesign the project'), true)

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${pass} passaram, ${fail} falharam`)
process.exit(fail ? 1 : 0)
