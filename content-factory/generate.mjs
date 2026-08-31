// content-factory/generate.mjs
//
// Gerador de peças de conteúdo da SPACENODE (Instagram @spacenode + Meta Ads).
// Lê brand-rules.md (fonte da verdade) + content-pillars.json, gera a copy via
// Gemini (ou conteúdo determinístico em --offline), valida contra os parâmetros
// máquina da marca e exporta o pacote completo para revisão humana.
//
// IMPORTANTE: este script GERA PARA REVISÃO. Ele nunca chama a API da Meta e
// nunca publica nada — ver brand-rules.md §6.
//
// Uso:
//   node content-factory/generate.mjs --tema "Linhas de fuga antes e depois" \
//     --pilar fidelidade-geometrica --campanha lancamento-julho \
//     [--formatos quadrado,vertical,story,carrossel] [--objetivo organico|trafego|ambos] [--offline]

import { parseArgs } from 'node:util'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------
// Caminhos — sempre resolvidos a partir do PRÓPRIO script, nunca do cwd.
// Assim `node content-factory/generate.mjs` funciona de qualquer diretório.
// ---------------------------------------------------------------------------
const SCRIPT_DIR    = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT     = path.resolve(SCRIPT_DIR, '..')
const BRAND_RULES   = path.join(SCRIPT_DIR, 'brand-rules.md')
const PILLARS_FILE  = path.join(SCRIPT_DIR, 'content-pillars.json')
const TEMPLATES_DIR = path.join(SCRIPT_DIR, 'templates')
const OUTPUT_DIR    = path.join(SCRIPT_DIR, 'output')
const FONT_FILE     = path.join(REPO_ROOT, 'public', 'fonts', 'geist-latin.woff2')

const MODELO_GEMINI = 'gemini-2.5-flash'

const FORMATOS_VALIDOS  = ['quadrado', 'vertical', 'story', 'carrossel']
const OBJETIVOS_VALIDOS = ['organico', 'trafego', 'ambos']

// Cada formato de preview lê um template HTML próprio (tokens {{...}}).
const TEMPLATE_POR_FORMATO = {
  quadrado:  'post-1080x1080.html',
  vertical:  'post-1080x1350.html',
  story:     'story-1080x1920.html',
  carrossel: 'carrossel-5-slides.html',
}

// Retry de erro transiente — mesmo racional do lib/gemini.ts do produto: o
// flash devolve 503 UNAVAILABLE / 429 RESOURCE_EXHAUSTED em pico de demanda e
// o erro some sozinho em segundos. Backoff exponencial curto absorve o pico.
const MAX_TENTATIVAS   = 3
const BACKOFF_BASE_MS  = 500
const TIMEOUT_MS       = 60_000

const USO = `Uso:
  node content-factory/generate.mjs --tema "..." --pilar <id> --campanha <slug> \\
    [--formatos quadrado,vertical,story,carrossel] [--objetivo organico|trafego|ambos] [--offline]`

function falhar(msg) {
  console.error(`ERRO: ${msg}\n\n${USO}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
let args
try {
  ({ values: args } = parseArgs({
    options: {
      tema:     { type: 'string' },
      pilar:    { type: 'string' },
      campanha: { type: 'string' },
      formatos: { type: 'string' },
      objetivo: { type: 'string' },
      offline:  { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  }))
} catch (e) {
  falhar(`argumentos inválidos — ${e.message}`)
}

if (!args.tema)     falhar('--tema é obrigatório (o assunto da peça, entre aspas).')
if (!args.pilar)    falhar('--pilar é obrigatório (id do pilar em content-pillars.json).')
if (!args.campanha) falhar('--campanha é obrigatória (slug da campanha, ex.: lancamento-julho).')

const objetivo = args.objetivo ?? 'ambos'
if (!OBJETIVOS_VALIDOS.includes(objetivo)) {
  falhar(`--objetivo "${objetivo}" inválido. Valores aceitos: ${OBJETIVOS_VALIDOS.join(', ')}.`)
}

const formatos = args.formatos
  ? args.formatos.split(',').map(f => f.trim()).filter(Boolean)
  : [...FORMATOS_VALIDOS]
for (const f of formatos) {
  if (!FORMATOS_VALIDOS.includes(f)) {
    falhar(`--formatos contém "${f}", que não existe. Formatos válidos: ${FORMATOS_VALIDOS.join(', ')}.`)
  }
}

// ---------------------------------------------------------------------------
// Fontes: brand-rules.md (inteiro, vai no prompt) + parâmetros máquina + pilar
// ---------------------------------------------------------------------------
if (!existsSync(BRAND_RULES))  falhar(`brand-rules.md não encontrado em ${BRAND_RULES}`)
if (!existsSync(PILLARS_FILE)) falhar(`content-pillars.json não encontrado em ${PILLARS_FILE}`)

const brandRules = readFileSync(BRAND_RULES, 'utf8')

// Extrai o bloco JSON da seção "## Parâmetros máquina" (o heading pode vir
// numerado, ex. "## 7. Parâmetros máquina") — é o contrato de validação.
function extrairParametrosMaquina(md) {
  const heading = md.match(/^##\s*(?:\d+\.\s*)?Parâmetros máquina.*$/m)
  const trecho = heading ? md.slice(heading.index) : md
  const fence = trecho.match(/```json\s*([\s\S]*?)```/)
  if (!fence) falhar('bloco ```json da seção "## Parâmetros máquina" não encontrado no brand-rules.md.')
  let params
  try {
    params = JSON.parse(fence[1])
  } catch (e) {
    falhar(`bloco JSON dos parâmetros máquina é inválido: ${e.message}`)
  }
  if (!Array.isArray(params.lexico_proibido) || typeof params.limites !== 'object' || !Array.isArray(params.cta_botoes_validos)) {
    falhar('parâmetros máquina incompletos — esperado { lexico_proibido[], limites{}, cta_botoes_validos[] }.')
  }
  return params
}
const params = extrairParametrosMaquina(brandRules)

let pilares
try {
  pilares = JSON.parse(readFileSync(PILLARS_FILE, 'utf8'))
} catch (e) {
  falhar(`content-pillars.json inválido: ${e.message}`)
}
const pilar = (pilares.pilares ?? []).find(p => p.id === args.pilar)
if (!pilar) {
  const ids = (pilares.pilares ?? []).map(p => `  - ${p.id}`).join('\n')
  falhar(`pilar "${args.pilar}" não existe. Ids válidos:\n${ids}`)
}

// ---------------------------------------------------------------------------
// GEMINI_API_KEY — padrão do repo (igual test-meta-connection.mjs): parseia o
// .env.local por regex linha a linha, strip de aspas, fallback pro ambiente.
// ---------------------------------------------------------------------------
function carregarGeminiKey() {
  const envPath = path.join(REPO_ROOT, '.env.local')
  if (existsSync(envPath)) {
    const env = readFileSync(envPath, 'utf8')
    const m = env.match(/^\s*GEMINI_API_KEY\s*=\s*(.+)\s*$/m)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  // .trim() também remove BOM (U+FEFF) — chave suja de pipe do PowerShell já
  // quebrou chamada do SDK no produto (header HTTP não aceita U+FEFF).
  return process.env.GEMINI_API_KEY?.trim()
}

// ---------------------------------------------------------------------------
// Helpers gerais
// ---------------------------------------------------------------------------
const dormir = ms => new Promise(r => setTimeout(r, ms))

// slug: lowercase, sem acento, hífens (Windows-safe pra nome de pasta)
function slugify(s) {
  const slug = s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'peca'
}

function contarPalavras(s) {
  return s.trim().split(/\s+/).filter(Boolean).length
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

// célula de tabela markdown: sem pipes nem quebras de linha soltas
function celulaMd(s) {
  return String(s).replaceAll('|', '\\|').replace(/\r?\n/g, ' ')
}

// O Gemini com responseMimeType json não deveria devolver cercas, mas o strip
// defensivo é barato e evita um retry inteiro por causa de um ```json perdido.
function parseJsonSolto(texto) {
  let t = String(texto).trim()
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  if (fence) t = fence[1]
  return JSON.parse(t)
}

// ---------------------------------------------------------------------------
// Validação de schema — presença e tipo de TODOS os campos do payload.
// ---------------------------------------------------------------------------
function validarSchema(p) {
  const erros = []
  const ehStr = v => typeof v === 'string' && v.trim().length > 0
  if (!p || typeof p !== 'object' || Array.isArray(p)) return ['a resposta não é um objeto JSON']

  for (const campo of ['headline', 'subtitulo', 'legenda', 'cta']) {
    if (!ehStr(p[campo])) erros.push(`${campo}: string não vazia obrigatória`)
  }

  if (!Array.isArray(p.hashtags) || p.hashtags.length === 0 || !p.hashtags.every(ehStr)) {
    erros.push('hashtags: array de strings obrigatório')
  }

  if (!p.story || typeof p.story !== 'object' || Array.isArray(p.story)) {
    erros.push('story: objeto { headline, suporte, cta_label } obrigatório')
  } else {
    for (const campo of ['headline', 'suporte', 'cta_label']) {
      if (!ehStr(p.story[campo])) erros.push(`story.${campo}: string não vazia obrigatória`)
    }
  }

  if (!Array.isArray(p.carrossel) || p.carrossel.length !== 5) {
    erros.push('carrossel: array com EXATAMENTE 5 slides { titulo, corpo }')
  } else {
    p.carrossel.forEach((s, i) => {
      if (!s || typeof s !== 'object' || !ehStr(s.titulo) || !ehStr(s.corpo)) {
        erros.push(`carrossel[${i}]: precisa de titulo e corpo (strings não vazias)`)
      }
    })
  }

  const r = p.roteiro_reels
  if (!r || typeof r !== 'object' || Array.isArray(r)) {
    erros.push('roteiro_reels: objeto obrigatório')
  } else {
    if (typeof r.duracao_alvo_s !== 'number' || !Number.isFinite(r.duracao_alvo_s)) {
      erros.push('roteiro_reels.duracao_alvo_s: número obrigatório')
    }
    if (!ehStr(r.gancho)) erros.push('roteiro_reels.gancho: string não vazia obrigatória')
    if (!ehStr(r.encerramento_cta)) erros.push('roteiro_reels.encerramento_cta: string não vazia obrigatória')
    if (!Array.isArray(r.cenas) || r.cenas.length === 0) {
      erros.push('roteiro_reels.cenas: array não vazio obrigatório')
    } else {
      r.cenas.forEach((c, i) => {
        for (const campo of ['tempo', 'imagem', 'texto_tela', 'narracao']) {
          if (!c || !ehStr(c[campo])) erros.push(`roteiro_reels.cenas[${i}].${campo}: string não vazia obrigatória`)
        }
      })
    }
  }

  if (!Array.isArray(p.anuncios) || p.anuncios.length !== 3) {
    erros.push('anuncios: array com EXATAMENTE 3 variações')
  } else {
    p.anuncios.forEach((a, i) => {
      for (const campo of ['angulo', 'texto_primario', 'titulo', 'descricao', 'cta_botao']) {
        if (!a || !ehStr(a[campo])) erros.push(`anuncios[${i}].${campo}: string não vazia obrigatória`)
      }
    })
  }

  const b = p.briefing_visual
  if (!b || typeof b !== 'object' || Array.isArray(b)) {
    erros.push('briefing_visual: objeto obrigatório')
  } else {
    for (const campo of ['conceito', 'imagem_sugerida', 'nota_slot_imagem', 'composicao', 'observacoes']) {
      if (!ehStr(b[campo])) erros.push(`briefing_visual.${campo}: string não vazia obrigatória`)
    }
  }

  return erros
}

// ---------------------------------------------------------------------------
// Validação de conteúdo — léxico proibido + limites dos parâmetros máquina.
// Roda SEMPRE (online e offline). Violação não aborta: vira aviso no REVIEW.md.
// ---------------------------------------------------------------------------
function coletarTextos(valor, caminho = '', acc = []) {
  if (typeof valor === 'string') acc.push({ caminho: caminho || '(raiz)', texto: valor })
  else if (Array.isArray(valor)) valor.forEach((v, i) => coletarTextos(v, `${caminho}[${i}]`, acc))
  else if (valor && typeof valor === 'object') {
    for (const [k, v] of Object.entries(valor)) coletarTextos(v, caminho ? `${caminho}.${k}` : k, acc)
  }
  return acc
}

function validarConteudo(p, params) {
  const violacoes = []
  const L = params.limites

  // 1) léxico proibido — scan case-insensitive em TODOS os textos do payload
  for (const { caminho, texto } of coletarTextos(p)) {
    const lower = texto.toLowerCase()
    for (const termo of params.lexico_proibido) {
      if (lower.includes(termo.toLowerCase())) {
        violacoes.push(`léxico proibido "${termo}" em ${caminho}`)
      }
    }
  }

  // 2) limites de tamanho
  if (contarPalavras(p.headline) > L.headline_arte_palavras) {
    violacoes.push(`headline com ${contarPalavras(p.headline)} palavras (máx. ${L.headline_arte_palavras})`)
  }
  const gancho = p.legenda.split(/\r?\n/)[0]
  if (gancho.length > L.gancho_legenda_chars) {
    violacoes.push(`1ª linha da legenda com ${gancho.length} caracteres (máx. ${L.gancho_legenda_chars})`)
  }
  p.anuncios.forEach((a, i) => {
    if (a.titulo.length > L.titulo_anuncio_chars) {
      violacoes.push(`anuncios[${i}].titulo com ${a.titulo.length} caracteres (máx. ${L.titulo_anuncio_chars})`)
    }
    if (a.descricao.length > L.descricao_anuncio_chars) {
      violacoes.push(`anuncios[${i}].descricao com ${a.descricao.length} caracteres (máx. ${L.descricao_anuncio_chars})`)
    }
    if (!params.cta_botoes_validos.includes(a.cta_botao)) {
      violacoes.push(`anuncios[${i}].cta_botao "${a.cta_botao}" inválido (válidos: ${params.cta_botoes_validos.join(', ')})`)
    }
  })
  p.carrossel.forEach((s, i) => {
    if (contarPalavras(s.titulo) > L.titulo_slide_palavras) {
      violacoes.push(`carrossel[${i}].titulo com ${contarPalavras(s.titulo)} palavras (máx. ${L.titulo_slide_palavras})`)
    }
    if (s.corpo.length > L.corpo_slide_chars) {
      violacoes.push(`carrossel[${i}].corpo com ${s.corpo.length} caracteres (máx. ${L.corpo_slide_chars})`)
    }
  })
  if (p.hashtags.length < L.hashtags_min || p.hashtags.length > L.hashtags_max) {
    violacoes.push(`${p.hashtags.length} hashtags (esperado entre ${L.hashtags_min} e ${L.hashtags_max})`)
  }
  p.hashtags.forEach((h, i) => {
    if (!h.startsWith('#')) violacoes.push(`hashtags[${i}] "${h}" não começa com #`)
  })

  return violacoes
}

// ---------------------------------------------------------------------------
// Geração online (Gemini)
// ---------------------------------------------------------------------------
const SCHEMA_RESPOSTA = `{
  "headline": string,                    // arte do feed, máx 8 palavras
  "subtitulo": string,                   // linha de apoio da arte, máx ~90 caracteres
  "legenda": string,                     // legenda IG completa: gancho na 1ª linha (≤125 chars), corpo, CTA
  "cta": string,
  "hashtags": string[],                  // 3–5, cada uma começando com #
  "story": { "headline": string, "suporte": string, "cta_label": string },
  "carrossel": [ { "titulo": string, "corpo": string } ],   // EXATAMENTE 5 slides
  "roteiro_reels": { "duracao_alvo_s": number, "gancho": string, "cenas": [ { "tempo": string, "imagem": string, "texto_tela": string, "narracao": string } ], "encerramento_cta": string },
  "anuncios": [ { "angulo": string, "texto_primario": string, "titulo": string, "descricao": string, "cta_botao": string } ],  // EXATAMENTE 3, ângulos distintos, cta_botao ∈ SIGN_UP|LEARN_MORE
  "briefing_visual": { "conceito": string, "imagem_sugerida": string, "nota_slot_imagem": string, "composicao": string, "observacoes": string }
}`

function montarSystemInstruction() {
  const objetivoDesc = {
    organico: 'Objetivo da peça: ORGÂNICO — alcance e autoridade no Instagram @spacenode. Priorize salvamento/compartilhamento; os anúncios do JSON são material de apoio.',
    trafego:  'Objetivo da peça: TRÁFEGO PAGO (Meta Ads, OUTCOME_TRAFFIC). Priorize clareza de oferta e clique; a copy orgânica do JSON é material de apoio.',
    ambos:    'Objetivo da peça: AMBOS — a mesma peça serve ao orgânico do Instagram e às variações de anúncio de tráfego. Copy orgânica e anúncios têm o mesmo peso.',
  }[objetivo]

  return [
    'Você é o redator sênior da SPACENODE. Gere UMA peça de conteúdo completa, em português do Brasil (pt-BR), seguindo À RISCA as regras de marca abaixo — voz, claims permitidos, limites por formato e léxico proibido.',
    '',
    '=== REGRAS DE MARCA (brand-rules.md — fonte da verdade, obedeça tudo) ===',
    brandRules,
    '',
    '=== PILAR EDITORIAL DESTA PEÇA ===',
    JSON.stringify(pilar, null, 2),
    '',
    '=== OBJETIVO ===',
    objetivoDesc,
    '',
    '=== FORMATO DA RESPOSTA ===',
    'Responda SOMENTE com JSON puro (sem markdown, sem cercas de código, sem comentários, sem texto fora do JSON), exatamente neste schema:',
    SCHEMA_RESPOSTA,
  ].join('\n')
}

// Erro transiente → vale retry. 400/401/JSON inválido não se curam sozinhos.
function ehTransiente(err) {
  const status = typeof err?.status === 'number' ? err.status
               : typeof err?.code === 'number' ? err.code
               : undefined
  if (status !== undefined && [429, 500, 502, 503, 504].includes(status)) return true
  const msg = typeof err?.message === 'string' ? err.message : String(err)
  if (/\b(429|500|502|503|504)\b/.test(msg)) return true
  return /UNAVAILABLE|RESOURCE_EXHAUSTED|timeout/i.test(msg)
}

async function chamarGemini(client, systemInstruction, promptUsuario) {
  let ultimoErro
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      // Timeout por tentativa via Promise.race — a Promise da SDK segue viva
      // por baixo, mas pro CLI o que importa é não travar o pipeline.
      const resposta = await Promise.race([
        client.models.generateContent({
          model: MODELO_GEMINI,
          contents: [promptUsuario],
          config: {
            systemInstruction,
            temperature: 0.55,
            maxOutputTokens: 3200,
            responseMimeType: 'application/json',
            // thinkingBudget 0: sem isso o 2.5 gasta os tokens "pensando" e
            // devolve JSON truncado — aprendido no lib/gemini.ts do produto.
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout de 60s na chamada ao Gemini')), TIMEOUT_MS)),
      ])
      const texto = resposta.text
      if (!texto) throw new Error('Gemini devolveu resposta vazia')
      return texto
    } catch (err) {
      ultimoErro = err
      if (tentativa === MAX_TENTATIVAS || !ehTransiente(err)) break
      const backoff = BACKOFF_BASE_MS * 2 ** (tentativa - 1) + Math.floor(Math.random() * 250)
      console.warn(`[gemini] tentativa ${tentativa}/${MAX_TENTATIVAS} falhou (${String(err?.message ?? err).slice(0, 120)}) — nova tentativa em ${backoff}ms`)
      await dormir(backoff)
    }
  }
  throw new Error(`falha na chamada ao Gemini (${MODELO_GEMINI}) após ${MAX_TENTATIVAS} tentativa(s): ${String(ultimoErro?.message ?? ultimoErro)}`)
}

async function gerarOnline() {
  const apiKey = carregarGeminiKey()
  if (!apiKey) {
    falhar('GEMINI_API_KEY não encontrada no .env.local (raiz do repo) nem no ambiente. Para testar o pipeline sem API, use --offline.')
  }

  // Import dinâmico: em --offline o script roda sem o pacote sequer carregar.
  const { GoogleGenAI } = await import('@google/genai')
  const client = new GoogleGenAI({ apiKey })
  const system = montarSystemInstruction()

  const promptInicial = [
    `Tema da peça: "${args.tema}"`,
    `Campanha: "${args.campanha}"`,
    `Formatos que serão exportados: ${formatos.join(', ')}`,
    '',
    'Gere a peça completa agora, respeitando todos os limites de caracteres/palavras e o léxico proibido das regras de marca.',
  ].join('\n')

  console.log(`Gerando com ${MODELO_GEMINI}...`)
  let bruto = await chamarGemini(client, system, promptInicial)

  let payload = null
  let errosSchema = []
  try {
    payload = parseJsonSolto(bruto)
    errosSchema = validarSchema(payload)
  } catch (e) {
    errosSchema = [`resposta não é JSON válido: ${e.message}`]
  }

  // Schema inválido → UMA nova tentativa pedindo correção explícita.
  if (errosSchema.length > 0) {
    console.warn(`Schema inválido (${errosSchema.length} erro(s)) — pedindo correção ao Gemini...`)
    const promptCorrecao = [
      'Sua resposta anterior NÃO seguiu o schema exigido. Erros encontrados:',
      ...errosSchema.map(e => `- ${e}`),
      '',
      'Resposta anterior:',
      bruto,
      '',
      'Devolva agora o JSON COMPLETO corrigido, exatamente no schema, sem nenhum texto fora do JSON.',
    ].join('\n')
    bruto = await chamarGemini(client, system, promptCorrecao)
    try {
      payload = parseJsonSolto(bruto)
      errosSchema = validarSchema(payload)
    } catch (e) {
      errosSchema = [`resposta não é JSON válido: ${e.message}`]
    }
    if (errosSchema.length > 0) {
      // Sem schema não há peça — abortamos com o diagnóstico completo.
      falhar(`o Gemini não devolveu o schema esperado mesmo após a correção:\n${errosSchema.map(e => `  - ${e}`).join('\n')}`)
    }
  }

  // Violações de marca → UMA rodada corretiva. Remanescentes NÃO abortam:
  // viram avisos no REVIEW.md (a revisão humana decide).
  let violacoes = validarConteudo(payload, params)
  if (violacoes.length > 0) {
    console.warn(`${violacoes.length} violação(ões) de marca — rodada corretiva...`)
    const promptFix = [
      'O JSON abaixo violou regras da marca. Corrija SOMENTE o necessário para eliminar as violações listadas, mantendo o restante do conteúdo, e devolva o JSON completo no mesmo schema, sem texto fora do JSON.',
      '',
      'Violações:',
      ...violacoes.map(v => `- ${v}`),
      '',
      'JSON atual:',
      JSON.stringify(payload),
    ].join('\n')
    try {
      const corrigido = parseJsonSolto(await chamarGemini(client, system, promptFix))
      if (validarSchema(corrigido).length === 0) {
        const violacoesCorrigido = validarConteudo(corrigido, params)
        // Só adota a correção se ela não piorou o placar.
        if (violacoesCorrigido.length <= violacoes.length) {
          payload = corrigido
          violacoes = violacoesCorrigido
        }
      }
    } catch (e) {
      console.warn(`rodada corretiva falhou (${String(e?.message ?? e).slice(0, 120)}) — mantendo a versão anterior; violações viram avisos.`)
    }
  }

  return { payload, violacoes }
}

// ---------------------------------------------------------------------------
// Modo --offline: conteúdo determinístico, compatível com todos os limites e
// sem léxico proibido. Serve para testar o pipeline inteiro sem gastar API.
// ---------------------------------------------------------------------------
function gerarOffline() {
  const cta = pilar.cta_padrao ?? 'Comece grátis'
  const payload = {
    headline: 'seu projeto, renderizado com fidelidade.',
    subtitulo: 'Geometria, proporção e perspectiva preservadas, do modelo à apresentação.',
    legenda: [
      'Linhas de fuga no lugar. Escala no lugar. Seu projeto, renderizado.',
      '',
      `Tema desta peça: ${args.tema}.`,
      '',
      'O cliente aprova o que vai ser construído — não uma versão fantasiosa dele. A imagem final preserva a geometria, a proporção e a perspectiva do seu modelo.',
      '',
      `${cta}. Link na bio.`,
    ].join('\n'),
    cta,
    hashtags: ['#arquitetura', '#archviz', '#renderizacao', '#visualizacaoarquitetonica'],
    story: {
      headline: 'o render que respeita seu projeto.',
      suporte: 'Do print do modelo à imagem de apresentação, em minutos.',
      cta_label: cta,
    },
    carrossel: [
      { titulo: 'seu projeto, não uma invenção.', corpo: 'Render de IA genérico redesenha o que você projetou. Aqui a geometria, a proporção e a perspectiva do modelo são preservadas do upload à imagem final.' },
      { titulo: 'linhas de fuga no lugar.', corpo: 'O ponto de fuga do render coincide com o do seu modelo. Sobreponha as linhas e confira — é o mesmo projeto, apresentado melhor.' },
      { titulo: 'escala e pé-direito corretos.', corpo: 'Mobiliário na escala certa, pé-direito respeitado, esquadrias onde você as desenhou. A especificação continua valendo depois do render.' },
      { titulo: 'coerência entre vistas.', corpo: 'Quatro ângulos do mesmo ambiente com um único DNA visual. O cliente entende o espaço — não quatro versões diferentes dele.' },
      { titulo: 'apresente com controle.', corpo: `Do modelo à imagem de apresentação em minutos, com revisão sua em cada etapa. ${cta}.` },
    ],
    roteiro_reels: {
      duracao_alvo_s: 20,
      gancho: 'Print do modelo na tela — e o render aparecendo por cima, alinhado linha por linha.',
      cenas: [
        { tempo: '0-3s',   imagem: 'Tela real: print do modelo 3D no upload da plataforma', texto_tela: 'seu modelo, como está.', narracao: 'Esse é o print do modelo, direto do seu 3D.' },
        { tempo: '3-10s',  imagem: 'Screen capture real do fluxo de renderização', texto_tela: 'sem redesenhar o projeto.', narracao: 'A plataforma renderiza preservando geometria, proporção e perspectiva.' },
        { tempo: '10-16s', imagem: 'Antes/depois do mesmo projeto com linhas de fuga sobrepostas', texto_tela: 'linhas de fuga no lugar.', narracao: 'Sobreponha as linhas de fuga: é o mesmo projeto, apresentado melhor.' },
        { tempo: '16-20s', imagem: 'Render final em tela cheia + wordmark monocromático', texto_tela: cta, narracao: `${cta}. O link está na bio.` },
      ],
      encerramento_cta: `${cta} — link na bio.`,
    },
    anuncios: [
      { angulo: 'fidelidade', texto_primario: 'Render que preserva geometria, proporção e perspectiva do seu modelo. O cliente aprova o que vai ser construído.', titulo: 'Render fiel ao seu projeto', descricao: 'Comece grátis', cta_botao: 'SIGN_UP' },
      { angulo: 'prazo', texto_primario: 'Do print do modelo à imagem de apresentação em minutos. Itere variações antes da reunião, sem depender de render externo.', titulo: 'Do modelo à imagem em minutos', descricao: 'Teste com um projeto', cta_botao: 'SIGN_UP' },
      { angulo: 'apresentacao-ao-cliente', texto_primario: 'Apresentação que o cliente leigo entende: vistas coerentes do mesmo projeto, na sequência certa para a reunião de aprovação.', titulo: 'Apresente o projeto como ele é', descricao: 'Saiba mais', cta_botao: 'LEARN_MORE' },
    ],
    briefing_visual: {
      conceito: 'Antes/depois honesto do mesmo projeto, com linhas de fuga sobrepostas em traço fino branco.',
      imagem_sugerida: 'Print real do modelo à esquerda, render real da plataforma à direita, mesmo enquadramento.',
      nota_slot_imagem: 'Slot reservado para render real do produto — nunca banco de imagem.',
      composicao: 'Fundo #0a0a0a, margens ≥96px, eyebrow com ponto verde de 6px, headline peso 600, apoio em #a1a1a6.',
      observacoes: 'Verde #30d158 só no ponto do eyebrow e no sublinhado do CTA (<5% da área). Wordmark monocromático.',
    },
  }
  return { payload, violacoes: validarConteudo(payload, params) }
}

// ---------------------------------------------------------------------------
// Export — pasta da peça, markdowns e previews HTML
// ---------------------------------------------------------------------------
function montarPastaSaida() {
  const agora = new Date()
  const data = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`
  const pastaCampanha = path.join(OUTPUT_DIR, `${data}_${slugify(args.campanha)}`)
  mkdirSync(pastaCampanha, { recursive: true })
  // NN sequencial dentro da campanha do dia: nº de pastas existentes + 1
  const existentes = readdirSync(pastaCampanha, { withFileTypes: true }).filter(d => d.isDirectory()).length
  const nn = String(existentes + 1).padStart(2, '0')
  const pastaPeca = path.join(pastaCampanha, `${nn}-${slugify(args.tema)}`)
  mkdirSync(pastaPeca, { recursive: true })
  return { pastaPeca, data }
}

function gerarPreviews(payload, pastaPeca, avisos) {
  const previewsDir = path.join(pastaPeca, 'previews')
  mkdirSync(previewsDir, { recursive: true })
  const escritos = []

  // Os templates apontam a fonte relativa à PRÓPRIA pasta deles; o preview
  // mora 2 níveis mais fundo, então recalculamos o caminho relativo real.
  // path.relative devolve '\' no Windows — navegador quer '/'.
  const fonteRelativa = path.relative(previewsDir, FONT_FILE).split(path.sep).join('/')

  const tokens = {
    EYEBROW: (pilar.nome ?? pilar.id).toUpperCase(),
    HEADLINE: payload.headline,
    SUPPORT: payload.subtitulo,
    CTA_LABEL: payload.story.cta_label,
    IMAGE_NOTE: payload.briefing_visual.nota_slot_imagem,
  }
  payload.carrossel.forEach((slide, i) => {
    tokens[`SLIDE${i + 1}_TITLE`] = slide.titulo
    tokens[`SLIDE${i + 1}_BODY`] = slide.corpo
  })

  for (const formato of formatos) {
    const templatePath = path.join(TEMPLATES_DIR, TEMPLATE_POR_FORMATO[formato])
    if (!existsSync(templatePath)) {
      avisos.push(`preview "${formato}" pulado: template ausente em ${templatePath}`)
      continue
    }
    let html = readFileSync(templatePath, 'utf8')
    html = html.split('../../public/fonts/geist-latin.woff2').join(fonteRelativa)
    html = html.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_m, nome) => {
      if (nome in tokens) return escapeHtml(tokens[nome])
      avisos.push(`token {{${nome}}} do template ${TEMPLATE_POR_FORMATO[formato]} sem valor mapeado — substituído por vazio`)
      return ''
    })
    const arquivo = path.join(previewsDir, `preview-${formato}.html`)
    writeFileSync(arquivo, html, 'utf8')
    escritos.push(arquivo)
  }
  return escritos
}

function montarCopyMd(p, data) {
  return `# Copy — ${args.tema}

**Pilar:** ${pilar.nome} (${pilar.id})  |  **Campanha:** ${args.campanha}  |  **Objetivo:** ${objetivo}  |  **Data:** ${data}

## Headline (arte)

${p.headline}

## Subtítulo (arte)

${p.subtitulo}

## Legenda (Instagram)

${p.legenda}

## CTA

${p.cta}

## Hashtags

${p.hashtags.join(' ')}
`
}

function montarReelsMd(p) {
  const r = p.roteiro_reels
  const linhas = r.cenas.map(c => `| ${celulaMd(c.tempo)} | ${celulaMd(c.imagem)} | ${celulaMd(c.texto_tela)} | ${celulaMd(c.narracao)} |`)
  return `# Roteiro Reels — ${args.tema}

**Duração alvo:** ${r.duracao_alvo_s}s

**Gancho (primeiros 3s):** ${r.gancho}

| Tempo | Imagem | Texto na tela | Narração |
|---|---|---|---|
${linhas.join('\n')}

**Encerramento / CTA:** ${r.encerramento_cta}
`
}

function montarAnunciosMd(p) {
  const L = params.limites
  const blocos = p.anuncios.map((a, i) => `## Variação ${i + 1} — ângulo: ${a.angulo}

**Texto primário:**

${a.texto_primario}

**Título:** ${a.titulo} (${a.titulo.length}/${L.titulo_anuncio_chars})
**Descrição:** ${a.descricao} (${a.descricao.length}/${L.descricao_anuncio_chars})
**Botão:** ${a.cta_botao}
`)
  return `# Anúncios (Meta Ads) — ${args.tema}

> Subir SEMPRE com status pausado. Revisão humana antes de ativar (brand-rules §6).

${blocos.join('\n')}`
}

function montarBriefingMd(p) {
  const b = p.briefing_visual
  return `# Briefing visual — ${args.tema}

**Conceito:** ${b.conceito}

**Imagem sugerida:** ${b.imagem_sugerida}

**Nota do slot de imagem:** ${b.nota_slot_imagem}

**Composição:** ${b.composicao}

**Observações:** ${b.observacoes}
`
}

function montarReviewMd(avisos) {
  const listaAvisos = avisos.length > 0 ? avisos.map(a => `- ${a}`).join('\n') : '- nenhum'
  return `⚠ Esta peça foi gerada para REVISÃO HUMANA. Nada é publicado automaticamente.

# REVIEW — ${args.tema}

## Checklist humano

- [ ] Voz sem hype? (seca, específica, sem léxico proibido — brand-rules §2)
- [ ] Claims verificados? (só recursos ativos em produção; conferir lib/nav/modules-config.ts — brand-rules §3)
- [ ] Limites ok? (headline ≤8 palavras, gancho ≤125, título ≤40, descrição ≤30 — brand-rules §4)
- [ ] Visual conforme brand-rules §5? (dark-first, verde <5% e só funcional, Geist, margens ≥96px, wordmark monocromático)
- [ ] Antes/depois honesto? (mesmo projeto real, resultado real da plataforma)

## Avisos automáticos

${listaAvisos}
`
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const modo = args.offline ? 'offline' : 'online'
  const { payload, violacoes } = args.offline ? gerarOffline() : await gerarOnline()

  const avisos = [...violacoes]
  const { pastaPeca, data } = montarPastaSaida()
  const escritos = []

  // Previews primeiro: eles podem acrescentar avisos que precisam entrar no
  // peca.json e no REVIEW.md.
  escritos.push(...gerarPreviews(payload, pastaPeca, avisos))

  const peca = {
    metadata: {
      tema: args.tema,
      pilar: { id: pilar.id, nome: pilar.nome },
      objetivo,
      campanha: args.campanha,
      data,
      modelo: args.offline ? null : MODELO_GEMINI,
      modo,
      avisos,
    },
    ...payload,
  }

  const arquivos = [
    ['peca.json', JSON.stringify(peca, null, 2) + '\n'],
    ['copy.md', montarCopyMd(payload, data)],
    ['reels.md', montarReelsMd(payload)],
    ['anuncios.md', montarAnunciosMd(payload)],
    ['briefing-visual.md', montarBriefingMd(payload)],
    ['REVIEW.md', montarReviewMd(avisos)],
  ]
  for (const [nome, conteudo] of arquivos) {
    const arquivo = path.join(pastaPeca, nome)
    writeFileSync(arquivo, conteudo, 'utf8')
    escritos.push(arquivo)
  }

  // Resumo em pt-BR — caminhos relativos à raiz pra leitura humana.
  console.log(`\nPeça gerada (modo ${modo}) em:\n  ${pastaPeca}\n`)
  console.log('Arquivos:')
  for (const a of escritos.sort()) {
    console.log(`  - ${path.relative(REPO_ROOT, a).split(path.sep).join('/')}`)
  }
  console.log(`\nAvisos: ${avisos.length}${avisos.length > 0 ? ' (ver REVIEW.md — revisar antes de usar)' : ''}`)
  console.log('Lembrete: nada é publicado automaticamente. Revisão humana obrigatória (brand-rules §6).')
}

main().catch(err => {
  console.error(`ERRO: ${String(err?.message ?? err)}`)
  process.exit(1)
})
