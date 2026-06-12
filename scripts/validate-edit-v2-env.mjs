#!/usr/bin/env node
// scripts/validate-edit-v2-env.mjs
//
// Validação SEGURA e SEM CUSTO do ambiente Google do Editar v2.
// - NUNCA imprime valores de envs, chaves ou JSON de credenciais — só nomes,
//   presença (✔/✖) e booleanos derivados.
// - NUNCA faz chamada paga: as checagens de rede são apenas metadata/auth
//   (listar modelos, handshake OAuth, GET de modelo) — endpoints sem cobrança.
// - Não altera nenhum arquivo.
//
// Uso:  node scripts/validate-edit-v2-env.mjs            (com checagens de rede gratuitas)
//       node scripts/validate-edit-v2-env.mjs --offline  (só presença/estrutura, zero rede)

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const ROOT = path.resolve(import.meta.dirname, '..')
const OFFLINE = process.argv.includes('--offline')

// --- .env.local (parse manual; valores ficam SÓ em process.env) -------------
function loadEnvLocal() {
  const p = path.join(ROOT, '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m || line.trim().startsWith('#')) continue
    let val = m[2]
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!(m[1] in process.env)) process.env[m[1]] = val
  }
}
loadEnvLocal()

const has = name => Boolean(process.env[name]?.trim())
const mark = v => (v ? '✔ presente' : '✖ ausente')

const GEMINI_KEY = process.env.GEMINI_API_KEY?.trim()
const V_PROJECT = process.env.GOOGLE_VERTEX_PROJECT?.trim()
const V_LOCATION = process.env.GOOGLE_VERTEX_LOCATION?.trim() || 'us-central1'
const V_CREDS = process.env.GOOGLE_VERTEX_CREDENTIALS_JSON?.trim()
const ADC_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()

console.log('\n========== VALIDAÇÃO DE AMBIENTE — EDITAR v2 (sem custo, sem segredos) ==========\n')

// ---------------------------------------------------------------------------
// 1–4) Presença de variáveis (nomes e status apenas)
// ---------------------------------------------------------------------------
console.log('A) VARIÁVEIS (.env.local + ambiente do processo)')
console.log(`   1. GEMINI_API_KEY ................... ${mark(has('GEMINI_API_KEY'))}`)
console.log(`   2. GOOGLE_VERTEX_PROJECT ............ ${mark(Boolean(V_PROJECT))}`)
console.log(`   3. GOOGLE_VERTEX_LOCATION ........... ${process.env.GOOGLE_VERTEX_LOCATION?.trim() ? `✔ presente (${V_LOCATION})` : `✖ ausente (default seria us-central1)`}`)
console.log(`   4a. GOOGLE_VERTEX_CREDENTIALS_JSON .. ${mark(Boolean(V_CREDS))}`)
console.log(`   4b. GOOGLE_APPLICATION_CREDENTIALS .. ${ADC_PATH ? `✔ presente (arquivo ${existsSync(ADC_PATH) ? 'existe' : 'NÃO existe'})` : '✖ ausente'}`)

// Equivalentes/auxiliares que podem existir
for (const alt of ['GOOGLE_CLOUD_PROJECT', 'GCLOUD_PROJECT', 'GOOGLE_API_KEY', 'GOOGLE_GENAI_API_KEY']) {
  if (has(alt)) console.log(`       (equivalente encontrado: ${alt} ✔)`)
}

// Flags do v2
console.log('\n   Flags do Editar v2:')
for (const f of ['EDIT_V2_ENABLED', 'NEXT_PUBLIC_EDIT_V2', 'GEMINI_EDIT_ENABLED', 'VERTEX_IMAGEN_ENABLED']) {
  console.log(`     ${f.padEnd(24)} ${process.env[f]?.trim() === '1' ? '✔ =1' : mark(has(f))}`)
}

// Arquivo de SA do experimento de 10/06 (só existência — nunca lido)
const expSa = path.join(os.homedir(), 'Downloads', 'gen-lang-client-0191517804-d3df6e49284c.json')
console.log(`\n   (informativo) SA do experimento em Downloads: ${existsSync(expSa) ? '✔ arquivo existe (NÃO lido por este script)' : '✖ não encontrado'}`)

// ---------------------------------------------------------------------------
// Estrutura da credencial (booleanos derivados; nada é impresso do conteúdo)
// ---------------------------------------------------------------------------
let credsObj = null
if (V_CREDS) {
  console.log('\nB) ESTRUTURA DE GOOGLE_VERTEX_CREDENTIALS_JSON (derivado, sem expor conteúdo)')
  try {
    credsObj = JSON.parse(V_CREDS)
    const okType = credsObj?.type === 'service_account'
    const hasProj = typeof credsObj?.project_id === 'string' && credsObj.project_id.length > 0
    const hasKey = typeof credsObj?.private_key === 'string' && credsObj.private_key.includes('PRIVATE KEY')
    const hasMail = typeof credsObj?.client_email === 'string' && credsObj.client_email.endsWith('.iam.gserviceaccount.com')
    const projMatch = hasProj && V_PROJECT ? credsObj.project_id === V_PROJECT : null
    console.log(`   JSON válido ........................ ✔`)
    console.log(`   type === service_account ........... ${okType ? '✔' : '✖'}`)
    console.log(`   contém project_id .................. ${hasProj ? '✔' : '✖'}`)
    console.log(`   contém private_key ................. ${hasKey ? '✔' : '✖'}`)
    console.log(`   client_email é de service account .. ${hasMail ? '✔' : '✖'}`)
    if (projMatch !== null) {
      console.log(`   project_id == GOOGLE_VERTEX_PROJECT  ${projMatch ? '✔' : '✖ DIVERGEM'}`)
    }
  } catch {
    credsObj = null
    console.log('   JSON válido ........................ ✖ (não parseia — conferir colagem/aspas/BOM)')
  }
}

// ---------------------------------------------------------------------------
// Inicialização dos providers (sem rede — só construção do client)
// ---------------------------------------------------------------------------
console.log('\nC) INICIALIZAÇÃO DOS PROVIDERS (sem chamada de rede)')
const { GoogleGenAI } = await import('@google/genai')

// 7) Gemini direto
if (GEMINI_KEY) {
  try {
    const g = new GoogleGenAI({ apiKey: GEMINI_KEY })
    const hasGen = typeof g.models?.generateContent === 'function'
    console.log(`   Provider gemini-image: client construído ✔ · models.generateContent ${hasGen ? '✔' : '✖'}`)
  } catch (e) {
    console.log(`   Provider gemini-image: ✖ falha ao construir client (${String(e?.message).slice(0, 100)})`)
  }
} else {
  console.log('   Provider gemini-image: ✖ sem GEMINI_API_KEY')
}

// 6) Vertex
if (V_PROJECT && credsObj) {
  try {
    const v = new GoogleGenAI({
      vertexai: true,
      project: V_PROJECT,
      location: V_LOCATION,
      googleAuthOptions: { credentials: credsObj },
    })
    const hasEdit = typeof v.models?.editImage === 'function'
    console.log(`   Provider vertex-imagen: client construído ✔ · models.editImage ${hasEdit ? '✔' : '✖ (SDK sem editImage)'}`)
  } catch (e) {
    console.log(`   Provider vertex-imagen: ✖ falha ao construir client (${String(e?.message).slice(0, 100)})`)
  }
} else {
  console.log(`   Provider vertex-imagen: ✖ não inicializável — falta ${[!V_PROJECT && 'GOOGLE_VERTEX_PROJECT', !V_CREDS && 'GOOGLE_VERTEX_CREDENTIALS_JSON'].filter(Boolean).join(' e ')}`)
}

// ---------------------------------------------------------------------------
// 5) Capacidades reais — checagens de REDE GRATUITAS (metadata/auth; nunca geração)
// ---------------------------------------------------------------------------
if (OFFLINE) {
  console.log('\nD) CHECAGENS DE REDE: puladas (--offline)')
} else {
  console.log('\nD) CHECAGENS DE REDE GRATUITAS (metadata/auth — nenhuma cobrança)')

  // D1: a GEMINI_API_KEY funciona na API Gemini? (GET lista de modelos — grátis)
  if (GEMINI_KEY) {
    try {
      const res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
        { headers: { 'x-goog-api-key': GEMINI_KEY }, signal: AbortSignal.timeout(15000) },
      )
      if (res.ok) {
        const body = await res.json()
        const names = (body.models ?? []).map(m => String(m.name ?? '').replace('models/', ''))
        const want = ['gemini-2.5-flash', 'gemini-3.1-flash-image', 'gemini-3-pro-image']
        console.log('   D1. GEMINI_API_KEY na API Gemini direta: ✔ chave VÁLIDA (listagem de modelos ok)')
        for (const w of want) {
          const hit = names.find(n => n === w || n.startsWith(w))
          console.log(`       modelo ${w.padEnd(26)} ${hit ? `✔ disponível${hit !== w ? ` (${hit})` : ''}` : '✖ não listado p/ esta chave'}`)
        }
      } else {
        console.log(`   D1. GEMINI_API_KEY na API Gemini direta: ✖ HTTP ${res.status} (chave inválida/restrita?)`)
      }
    } catch (e) {
      console.log(`   D1. GEMINI_API_KEY: ✖ erro de rede (${String(e?.message).slice(0, 80)})`)
    }

    // D2: a MESMA key habilita Vertex (modo express)? GET metadata — grátis.
    try {
      const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.1-flash-image`
      const res = await fetch(url, { headers: { 'x-goog-api-key': GEMINI_KEY }, signal: AbortSignal.timeout(15000) })
      if (res.ok) {
        console.log('   D2. Mesma key no Vertex (express): ✔ aceita — Vertex via API key é possível')
      } else {
        console.log(`   D2. Mesma key no Vertex (express): ✖ HTTP ${res.status} — a key é só da API Gemini direta`)
      }
    } catch (e) {
      console.log(`   D2. Vertex express probe: erro de rede (${String(e?.message).slice(0, 80)})`)
    }
  } else {
    console.log('   D1/D2: pulado — sem GEMINI_API_KEY')
  }

  // D3: a service account autentica? (handshake OAuth — grátis; token nunca impresso)
  if (credsObj) {
    try {
      const { GoogleAuth } = await import('google-auth-library')
      const auth = new GoogleAuth({
        credentials: credsObj,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      })
      const client = await auth.getClient()
      const token = await client.getAccessToken()
      const okTok = Boolean(token?.token)
      console.log(`   D3. Service account autentica (OAuth): ${okTok ? '✔ token obtido (não exibido)' : '✖ sem token'}`)

      // D4: com o token, o modelo Imagen capability está visível no projeto/região? (GET — grátis)
      if (okTok) {
        const url = `https://${V_LOCATION}-aiplatform.googleapis.com/v1/projects/${V_PROJECT}/locations/${V_LOCATION}/publishers/google/models/imagen-3.0-capability-001`
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token.token}` },
          signal: AbortSignal.timeout(15000),
        })
        if (res.ok) {
          console.log('   D4. imagen-3.0-capability-001 visível no projeto/região: ✔ (metadata ok — pronto p/ smoke pago)')
        } else if (res.status === 403) {
          console.log('   D4. imagen-3.0-capability-001: ✖ HTTP 403 — sem permissão (papel Vertex AI User?) ou modelo não habilitado')
        } else if (res.status === 404) {
          console.log(`   D4. imagen-3.0-capability-001: ✖ HTTP 404 — não disponível em ${V_LOCATION} p/ este projeto`)
        } else {
          console.log(`   D4. imagen-3.0-capability-001: ✖ HTTP ${res.status}`)
        }
      }
    } catch (e) {
      console.log(`   D3. Service account: ✖ falha de auth (${String(e?.message).slice(0, 120)})`)
    }
  } else {
    console.log('   D3/D4: pulado — sem GOOGLE_VERTEX_CREDENTIALS_JSON válida')
  }
}

// ---------------------------------------------------------------------------
// Veredicto
// ---------------------------------------------------------------------------
console.log('\nE) VEREDICTO')
const geminiReady = Boolean(GEMINI_KEY)
const vertexReady = Boolean(V_PROJECT && credsObj)
console.log(`   Smoke Gemini direto (Flash/Pro): ${geminiReady ? '✔ PRONTO (aguardando sua autorização de chamada paga)' : '✖ bloqueado — falta GEMINI_API_KEY'}`)
console.log(`   Smoke Vertex/Imagen:            ${vertexReady ? '✔ PRONTO (aguardando sua autorização de chamada paga)' : '✖ bloqueado — Vertex/Imagen depende de credencial GCP adequada (service account) nas envs GOOGLE_VERTEX_*'}`)
console.log('\nNenhuma chamada paga foi feita. Nenhum segredo foi exibido. Nenhum arquivo foi alterado.\n')
