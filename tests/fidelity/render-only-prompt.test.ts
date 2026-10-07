// tests/fidelity/render-only-prompt.test.ts
//
// Contrato do system prompt centralizado do modo render_only (Máxima):
//   - aplicado ANTES dos blocos derivados do usuário;
//   - nomeia todos os invariantes obrigatórios (geometria, câmera, paredes,
//     portas/janelas, marcenaria, mobiliário, bancadas, equipamentos,
//     proporções, layout/composição);
//   - proíbe adicionar/remover/mover/redimensionar;
//   - escalada só nos retries; edge map só quando anexado;
//   - balanced/creative intactos (redesign fora do render_only);
//   - ladder de parâmetros por tentativa + config por env.

import { describe, it, expect, afterEach } from 'vitest'
import {
  buildFidelityPrompt,
  buildNegativePromptForFidelity,
  type GenerateOptions,
} from '@/lib/prompts'
import {
  NEGATIVE_BASE,
  getFidelityAttemptParams,
  getRenderFidelityConfig,
  nativeUltraFromFirstAttempt,
} from '@/lib/ai/fidelity/render-only'

const baseOptions: GenerateOptions = {
  projectType: 'interior',
  segment: 'Residencial',
  environment: 'Cozinha',
  lighting: 'Preservar Original',
  background: 'Preservar Original',
  sceneElements: [],
  geometryLock: 85,
  materials: { piso: 'porcelanato cinza 90x90' },
  fidelityMode: 'strict',
  fidelityLevel: 'maximum',
  hasAnchor: false,
}

describe('interior light sources and legacy project notes', () => {
  it.each(['Preservar Original', 'Natural Suave', 'Luz de Janela'])('bounds photographic lighting to supported sources with %s', lighting => {
    const prompt = buildFidelityPrompt({ ...baseOptions, lighting }, 'maximum')
    expect(prompt).toContain('LIGHT SOURCE CONSISTENCY')
    expect(prompt).toContain('Do not invent off-camera windows')
    expect(prompt).toContain('A lighting atmosphere changes the quality of light, not the location or existence of its sources')
    expect(prompt).toContain('Explicit user constraints on source position, glare and reflections take priority')
    expect(prompt).toContain('do not erase them globally')
  })

  it('treats notes-only instructions as scene directions, not a material replacement', () => {
    const notes = 'No light enters from the right. Keep the curtains closed.'
    const prompt = buildFidelityPrompt({ ...baseOptions, materials: { outros: notes } }, 'maximum')
    expect(prompt).toContain(`USER PROJECT NOTES: "${notes}"`)
    expect(prompt).not.toContain('MATERIAL OVERRIDES')
    expect(prompt).not.toContain('additional notes:')
    expect(prompt).toContain('Specific constraints on light sources, reflections and openings take priority')
    expect(prompt).toContain('they never authorize changing geometry')
  })

  it('keeps actual surface overrides while separating free-text directions', () => {
    const prompt = buildFidelityPrompt({ ...baseOptions, materials: { piso: 'grey stone', outros: 'Keep the curtain closed.' } }, 'maximum')
    expect(prompt).toContain('MATERIAL OVERRIDES')
    expect(prompt).toContain('flooring: grey stone')
    expect(prompt).toContain('USER PROJECT NOTES')
    expect(prompt.indexOf('USER PROJECT NOTES')).toBeGreaterThan(prompt.indexOf('Every surface NOT named'))
    expect(buildFidelityPrompt({ ...baseOptions, materials: { outros: '   ' } }, 'maximum')).not.toContain('USER PROJECT NOTES')
  })

  it('does not apply the interior light-source policy to exteriors or legacy creative mode', () => {
    expect(buildFidelityPrompt({ ...baseOptions, projectType: 'exterior' }, 'maximum')).not.toContain('LIGHT SOURCE CONSISTENCY')
    expect(buildFidelityPrompt(baseOptions, 'creative')).not.toContain('LIGHT SOURCE CONSISTENCY')
  })
})

describe('render_only: system prompt antes do prompt do usuário', () => {
  it('applies first-render direction without an anchor while keeping the geometry lock', () => {
    const instruction = 'Luz suave, sem reflexos intensos no painel à direita.'
    const prompt = buildFidelityPrompt({ ...baseOptions, hasAnchor: false, refinementText: instruction }, 'maximum')
    expect(prompt).toContain(`USER DIRECTION: "${instruction}"`)
    expect(prompt.indexOf('RENDER-ONLY MODE')).toBeLessThan(prompt.indexOf('USER DIRECTION'))
    expect(prompt).toContain('The direction never overrides the geometry lock')
    expect(prompt).not.toContain('USER REFINEMENT REQUEST')
    expect(buildFidelityPrompt({ ...baseOptions, refinementText: '   ' }, 'maximum')).not.toContain('USER DIRECTION')
  })
  it('photographic directions cannot request new grain or micro-texture on a plain CAD surface', () => {
    const prompt = buildFidelityPrompt({...baseOptions, materials: {}}, 'maximum')
    expect(prompt).not.toContain('real-world physically-based materials and natural micro-texture')
    expect(prompt).not.toContain('real micro-texture, grain')
    expect(prompt).not.toContain('concrete and stone with grain')
    expect(prompt).toContain('Realism comes from lighting, not added grain')
    expect(prompt).toContain('Visible panel grooves or tile joints do not imply wood grain')
  })
  it('realismo e retry não autorizam substituição genérica de materiais; overrides explícitos continuam disponíveis', () => {
    const prompt = buildFidelityPrompt(baseOptions, 'maximum', undefined, { attempt: 2 })
    expect(prompt).toContain('Material identity is fixed by default')
    expect(prompt).not.toContain('you may change ONLY materials')
    expect(prompt).not.toContain('as if projecting new materials')
    expect(prompt).toContain('do not project new materials onto the scene')
    expect(prompt).toContain('MATERIAL OVERRIDES')
    expect(prompt).toContain('porcelanato cinza 90x90')
  })
  it('contrato e locks precedem materiais do usuário', () => {
    const p = buildFidelityPrompt(baseOptions, 'maximum')
    const contract = p.indexOf('RENDER-ONLY MODE')
    const geoLock = p.indexOf('GEOMETRY LOCK')
    const userMaterials = p.indexOf('MATERIAL OVERRIDES')
    expect(contract).toBeGreaterThanOrEqual(0)
    expect(geoLock).toBeGreaterThanOrEqual(0)
    expect(userMaterials).toBeGreaterThanOrEqual(0)
    expect(contract).toBeLessThan(userMaterials)
    expect(geoLock).toBeLessThan(userMaterials)
  })

  it('contrato precede o refinamento do usuário (fluxo com âncora)', () => {
    const p = buildFidelityPrompt(
      { ...baseOptions, hasAnchor: true, refinementText: 'trocar só o piso' },
      'maximum',
    )
    const contract = p.indexOf('RENDER-ONLY MODE')
    const refinement = p.indexOf('USER REFINEMENT REQUEST')
    expect(refinement).toBeGreaterThanOrEqual(0)
    expect(contract).toBeLessThan(refinement)
  })
})

describe('render_only: invariantes obrigatórios', () => {
  const prompt = buildFidelityPrompt(baseOptions, 'maximum').toLowerCase()

  it.each([
    'camera position',
    'perspective',
    'wall',
    'door',
    'window',
    'cabinetry',
    'millwork',
    'furniture',
    'countertop',
    'equipment',
    'proportion',
    'layout',
    'composition',
  ])('cita "%s"', term => {
    expect(prompt).toContain(term)
  })

  it('proíbe adicionar/remover/mover/redimensionar', () => {
    expect(prompt).toContain('never add, remove, move or resize')
  })

  it('negativos cobrem mobiliário/marcenaria/bancadas/equipamentos', () => {
    const negative = buildNegativePromptForFidelity('maximum')
    expect(negative).toContain('no added, removed, relocated, rotated, rescaled or redesigned furniture')
    expect(negative).toContain('countertops')
    expect(negative).toContain('equipment')
  })
})

describe('render_only: contexto de cena (Segmento/Espaço religados na Máxima)', () => {
  it('Máxima inclui SCENE TYPE com nome curto do ambiente', () => {
    const p = buildFidelityPrompt(baseOptions, 'maximum')
    expect(p).toContain('SCENE TYPE')
    expect(p).toContain('high-end residential')
    expect(p).toContain('kitchen')
  })

  it('nunca vaza a descrição prescritiva do ENV_EN (isca de drift)', () => {
    // ENV_EN['Cozinha'] = 'kitchen with custom cabinetry, quartz countertop…'
    // — na Máxima só o substantivo inicial pode entrar.
    const p = buildFidelityPrompt(baseOptions, 'maximum')
    expect(p).not.toContain('custom cabinetry')
    expect(p).not.toContain('quartz countertop')
  })

  it('contrato render-only continua precedendo o contexto', () => {
    const p = buildFidelityPrompt(baseOptions, 'maximum')
    expect(p.indexOf('RENDER-ONLY MODE')).toBeGreaterThanOrEqual(0)
    expect(p.indexOf('RENDER-ONLY MODE')).toBeLessThan(p.indexOf('SCENE TYPE'))
  })
})

describe('render_only: escalada e condicionamento estrutural', () => {
  it('attempt 1 não tem escalada; attempt 2 tem', () => {
    const a1 = buildFidelityPrompt(baseOptions, 'maximum', undefined, { attempt: 1 })
    const a2 = buildFidelityPrompt(baseOptions, 'maximum', undefined, { attempt: 2 })
    expect(a1).not.toContain('ABSOLUTE STRUCTURAL PRIORITY')
    expect(a2).toContain('ABSOLUTE STRUCTURAL PRIORITY')
  })

  it('bloco do edge map só aparece com índice e cita a imagem certa', () => {
    const sem = buildFidelityPrompt(baseOptions, 'maximum', undefined, { attempt: 2 })
    const com = buildFidelityPrompt(baseOptions, 'maximum', undefined, { attempt: 2, edgeMapImageIndex: 3 })
    expect(sem).not.toContain('STRUCTURAL CONSTRAINT MAP')
    expect(com).toContain('STRUCTURAL CONSTRAINT MAP')
    expect(com).toContain('image #3')
  })

  it('bloco do depth map só aparece com índice', () => {
    const sem = buildFidelityPrompt(baseOptions, 'maximum')
    const com = buildFidelityPrompt(baseOptions, 'maximum', undefined, { depthMapImageIndex: 4 })
    expect(sem).not.toContain('DEPTH CONSTRAINT MAP')
    expect(com).toContain('DEPTH CONSTRAINT MAP')
    expect(com).toContain('image #4')
  })

  it('amostras de material citam imagem e superfície com escopo fechado', () => {
    const p = buildFidelityPrompt(baseOptions, 'maximum', undefined, {
      materialSamples: [{ field: 'piso', imageIndex: 2 }, { field: 'bancadas', imageIndex: 3 }],
    })
    expect(p).toContain('MATERIAL SAMPLES')
    expect(p).toContain('image #2 is the real product sample for the flooring')
    expect(p).toContain('image #3 is the real product sample for the countertops')
    expect(p).toContain('never change geometry')
  })
})

describe('render_only: edge map na 1ª tentativa (opt-in do caller)', () => {
  it('default segue sem edge map na 1ª; com a opção liga só na 1ª', () => {
    expect(getFidelityAttemptParams(1).useEdgeMap).toBe(false)
    expect(getFidelityAttemptParams(1, { edgeFromFirstAttempt: true }).useEdgeMap).toBe(true)
    // Retries sempre têm edge map, independente da opção.
    expect(getFidelityAttemptParams(2, { edgeFromFirstAttempt: false }).useEdgeMap).toBe(true)
  })
})

describe('níveis balanced/creative seguem fora do render_only', () => {
  it.each(['balanced', 'creative'] as const)('%s não recebe contrato nem escalada', level => {
    const p = buildFidelityPrompt({ ...baseOptions, fidelityLevel: level }, level, undefined, {
      attempt: 2,
      edgeMapImageIndex: 3,
    })
    expect(p).not.toContain('RENDER-ONLY MODE')
    expect(p).not.toContain('ABSOLUTE STRUCTURAL PRIORITY')
    expect(p).not.toContain('STRUCTURAL CONSTRAINT MAP')
  })

  it('balanced mantém o negativo base sem os extras do render_only', () => {
    expect(buildNegativePromptForFidelity('balanced')).toBe(`AVOID: ${NEGATIVE_BASE.join(', ')}.`)
  })
})

describe('render_only: ladder de parâmetros', () => {
  it('escala por condicionamento (edge map, mediaRes, seed) com temperatura FIXA', () => {
    const a1 = getFidelityAttemptParams(1)
    const a2 = getFidelityAttemptParams(2)
    const a3 = getFidelityAttemptParams(3)
    expect(a1).toEqual({ temperature: 0.2, useEdgeMap: false, thinkingLevel: 'high', mediaResolution: 'high', seedOffset: 0 })
    expect(a2).toEqual({ temperature: 0.2, useEdgeMap: true, thinkingLevel: 'high', mediaResolution: 'ultra_high', seedOffset: 0 })
    expect(a3).toEqual({ temperature: 0.2, useEdgeMap: true, thinkingLevel: 'high', mediaResolution: 'ultra_high', seedOffset: 1 })
    // Guia do Gemini 3: não derrubar a temperatura pra perto de 0 — a
    // escalada dos retries é por condicionamento, não por sampling.
    expect(a2.temperature).toBe(a1.temperature)
    expect(a3.temperature).toBe(a2.temperature)
    // Tentativa 3 troca a amostra (mantendo reprodutibilidade via offset).
    expect(a3.seedOffset).toBeGreaterThan(a2.seedOffset)
    // Ladder 4 só existe no boost com mapa nativo (offset 2): amostra nova de novo.
    expect(getFidelityAttemptParams(4).seedOffset).toBe(2)
  })

  it('kill-switches: IMAGE_NB2_THINKING_LEVEL=off e IMAGE_INPUT_MEDIA_RESOLUTION=off', () => {
    const savedThinking = process.env.IMAGE_NB2_THINKING_LEVEL
    const savedMedia    = process.env.IMAGE_INPUT_MEDIA_RESOLUTION
    process.env.IMAGE_NB2_THINKING_LEVEL     = 'off'
    process.env.IMAGE_INPUT_MEDIA_RESOLUTION = 'off'
    try {
      const a2 = getFidelityAttemptParams(2)
      expect(a2.thinkingLevel).toBeNull()
      expect(a2.mediaResolution).toBeNull()
      expect(a2.useEdgeMap).toBe(true)
    } finally {
      if (savedThinking === undefined) delete process.env.IMAGE_NB2_THINKING_LEVEL
      else process.env.IMAGE_NB2_THINKING_LEVEL = savedThinking
      if (savedMedia === undefined) delete process.env.IMAGE_INPUT_MEDIA_RESOLUTION
      else process.env.IMAGE_INPUT_MEDIA_RESOLUTION = savedMedia
    }
  })
})

describe('render_only: config por env', () => {
  const saved = {
    gate: process.env.RENDER_FIDELITY_GATE,
    min: process.env.RENDER_FIDELITY_MIN_SCORE,
    max: process.env.RENDER_FIDELITY_MAX_ATTEMPTS,
  }
  afterEach(() => {
    if (saved.gate === undefined) delete process.env.RENDER_FIDELITY_GATE
    else process.env.RENDER_FIDELITY_GATE = saved.gate
    if (saved.min === undefined) delete process.env.RENDER_FIDELITY_MIN_SCORE
    else process.env.RENDER_FIDELITY_MIN_SCORE = saved.min
    if (saved.max === undefined) delete process.env.RENDER_FIDELITY_MAX_ATTEMPTS
    else process.env.RENDER_FIDELITY_MAX_ATTEMPTS = saved.max
  })

  it('defaults: gate ligado, minScore 0.5, 2 tentativas', () => {
    delete process.env.RENDER_FIDELITY_GATE
    delete process.env.RENDER_FIDELITY_MIN_SCORE
    delete process.env.RENDER_FIDELITY_MAX_ATTEMPTS
    const cfg = getRenderFidelityConfig()
    expect(cfg.enabled).toBe(true)
    expect(cfg.minScore).toBe(0.5)
    expect(cfg.maxAttempts).toBe(2)
    expect(cfg.refinementRelaxFactor).toBeLessThan(1)
  })

  it('RENDER_FIDELITY_GATE=0 desliga; envs ajustam limite e tentativas (cap 3)', () => {
    process.env.RENDER_FIDELITY_GATE = '0'
    process.env.RENDER_FIDELITY_MIN_SCORE = '0.72'
    process.env.RENDER_FIDELITY_MAX_ATTEMPTS = '9'
    const cfg = getRenderFidelityConfig()
    expect(cfg.enabled).toBe(false)
    expect(cfg.minScore).toBe(0.72)
    expect(cfg.maxAttempts).toBe(3)
  })
})

// ── 1.9.0 — sinais do plugin SketchUp (web sem sinal fica byte-idêntico) ─────
describe('render_only: edge map nativo e fatos medidos (plugin 1.9.0)', () => {
  it('sem edgeMapNative o bloco do edge map é o de sempre', () => {
    const p = buildFidelityPrompt(baseOptions, 'maximum', undefined, { attempt: 1, edgeMapImageIndex: 2 })
    expect(p).toContain('automatically extracted edge/line map')
    expect(p).not.toContain('EXACT hidden-line drawing')
  })

  it('com edgeMapNative o bloco cobra alinhamento ao desenho exato do modelo', () => {
    const p = buildFidelityPrompt(baseOptions, 'maximum', undefined, { attempt: 1, edgeMapImageIndex: 2, edgeMapNative: true })
    expect(p).toContain('image #2 is the EXACT hidden-line drawing of the 3D model')
    expect(p).toContain('these lines win')
    expect(p).toContain('Do NOT imitate its graphic style')
    expect(p).not.toContain('automatically extracted')
  })

  it('edgeMapNative sem índice não emite bloco nenhum', () => {
    const p = buildFidelityPrompt(baseOptions, 'maximum', undefined, { attempt: 1, edgeMapImageIndex: null, edgeMapNative: true })
    expect(p).not.toContain('STRUCTURAL CONSTRAINT MAP')
  })

  const briefing = {
    tipo_projeto: 'residencial',
    geometria_principal: 'planta retangular',
    volumes: 'um volume',
    pavimentos: 1,
    aberturas: 'duas janelas',
    materiais_aparentes: 'reboco pintado',
    camera: 'wide angle, slightly elevated',
    entorno: 'rua residencial',
    elementos_preservar: [],
  }

  it('briefing sem fatos medidos mantém a linha de câmera do auditor', () => {
    const p = buildFidelityPrompt(baseOptions, 'maximum', briefing as never)
    expect(p).toContain('- Camera: wide angle, slightly elevated')
  })

  it('com câmera medida (MODEL FACTS) a câmera "vista" sai do PROJECT FACTS', () => {
    const p = buildFidelityPrompt(
      { ...baseOptions, modelFacts: { camera: { focalLengthMm: 24, fovDeg: 73.7, eyeHeightM: 1.55 } } },
      'maximum',
      briefing as never,
    )
    expect(p).not.toContain('- Camera: wide angle')
    expect(p).toContain('MODEL FACTS')
    expect(p).toContain('- Openings: duas janelas')
  })

  it('ultraFromFirstAttempt tokeniza em ultra_high já na 1ª tentativa (default high)', () => {
    delete process.env.IMAGE_INPUT_MEDIA_RESOLUTION
    expect(getFidelityAttemptParams(1).mediaResolution).toBe('high')
    expect(getFidelityAttemptParams(1, { ultraFromFirstAttempt: true }).mediaResolution).toBe('ultra_high')
    expect(getFidelityAttemptParams(2).mediaResolution).toBe('ultra_high')
  })

  it('ultra na 1ª tentativa é opt-in por env (custo não medido não vai cego pra produção)', () => {
    const saved = process.env.RENDER_FIDELITY_NATIVE_ULTRA
    delete process.env.RENDER_FIDELITY_NATIVE_ULTRA
    expect(nativeUltraFromFirstAttempt()).toBe(false)
    process.env.RENDER_FIDELITY_NATIVE_ULTRA = '1'
    expect(nativeUltraFromFirstAttempt()).toBe(true)
    if (saved === undefined) delete process.env.RENDER_FIDELITY_NATIVE_ULTRA
    else process.env.RENDER_FIDELITY_NATIVE_ULTRA = saved
  })
})
