// tests/spaces/reference-prompt.test.ts
//
// Contrato do prompt único do Spaces (fluxo Referência → Ação → Gerar) após o
// refactor 2026-08-04 (binding ordinal + wrong-base check + escalada do gate
// de fidelidade):
//   - a missão da ação abre o prompt (primazia);
//   - caso dual-image: papéis vinculados por ORDEM de anexo, conflict rule e
//     wrong-base check presentes; Image #2 nunca autoriza geometria;
//   - escalada só em attempt >= 2; edge map só quando anexado (índice certo);
//   - travas de textura/elementos e negativos coerentes por ação;
//   - rótulos de parte de imagem (caminho GCP) espelham os papéis.

import { describe, it, expect } from 'vitest'
import { buildGenerationPrompt, type GenerationPromptInput } from '@/lib/spaces/reference-prompt'
import { imagePartLabelsFor, imageUrlsFor, type ReferenceSet } from '@/lib/spaces/references'

const base: GenerationPromptInput = {
  action:           'nova_vista',
  refKind:          'print',
  hasIdentityImage: true,
  userIntent:       '',
  userInstruction:  null,
  referenceLabel:   'Fachada lateral',
  briefing:         null,
  dna:              null,
  quality:          '2k',
}

describe('print upado + Vista Mestre (dual-image): papéis e anti-troca de âncora', () => {
  const p = buildGenerationPrompt(base)

  it('missão abre o prompt com a autoridade geométrica do print', () => {
    expect(p.startsWith('TASK:')).toBe(true)
    expect(p).toContain('ABSOLUTE GEOMETRIC AUTHORITY')
  })

  it('binding ordinal: Image #1 = primeira anexada, Image #2 = segunda', () => {
    expect(p).toContain('Image #1 = the FIRST attached image')
    expect(p).toContain('Image #2 = the SECOND attached image')
  })

  it('wrong-base check proíbe output parecido com a Image #2', () => {
    expect(p).toContain('WRONG-BASE CHECK')
    expect(p).toContain('FAILED generation')
    expect(p).toContain('the output is Image #1, made real')
  })

  it('conflict rule: geometria vence a identidade', () => {
    expect(p).toContain('CONFLICT RULE')
    expect(p).toContain('GEOMETRY WINS')
  })

  it('identidade transfere material por superfície correspondente', () => {
    expect(p).toContain('MATCHING surface')
  })

  it('negativos proíbem reproduzir cena/viewpoint da Image #2', () => {
    expect(p).toContain("do not reproduce Image #2's viewpoint")
    expect(p).toContain('do not let Image #2 override any geometry of Image #1')
  })

  it('trava de textura presente (materiais são evidência fotográfica)', () => {
    expect(p).toContain('MATERIAL & TEXTURE FIDELITY')
    expect(p).toContain('never regenerate a texture with a new random')
  })
})

describe('escalada do gate de fidelidade (retry)', () => {
  it('attempt 1 (ou ausente) não tem escalada', () => {
    expect(buildGenerationPrompt(base)).not.toContain('ABSOLUTE STRUCTURAL PRIORITY')
    expect(buildGenerationPrompt({ ...base, attempt: 1 })).not.toContain('ABSOLUTE STRUCTURAL PRIORITY')
  })

  it('attempt 2 liga a escalada ancorada na Image #1', () => {
    const p = buildGenerationPrompt({ ...base, attempt: 2 })
    expect(p).toContain('ABSOLUTE STRUCTURAL PRIORITY')
    expect(p).toContain('treat Image #1 as a fixed template')
    // dual-image: reforço de que a #2 não contribui geometria
    expect(p).toContain('zero geometry, zero composition, zero scene content')
  })

  it('bloco do edge map só aparece com índice e cita a imagem certa', () => {
    const sem = buildGenerationPrompt({ ...base, attempt: 2 })
    const com = buildGenerationPrompt({ ...base, attempt: 2, edgeMapImageIndex: 3 })
    expect(sem).not.toContain('STRUCTURAL CONSTRAINT MAP')
    expect(com).toContain('STRUCTURAL CONSTRAINT MAP')
    expect(com).toContain('image #3')
  })
})

describe('ações single-image mantêm o contrato', () => {
  it('luz: relight minimalista, câmera travada', () => {
    const p = buildGenerationPrompt({
      ...base, action: 'luz', refKind: 'vista_mestre', hasIdentityImage: false,
      userIntent: 'golden hour light', referenceLabel: null,
    })
    expect(p).toContain('RELIGHT')
    expect(p).toContain('do not change the camera')
    expect(p).not.toContain('SECOND attached image')
  })

  it('material: troca cirúrgica, demais superfícies intactas', () => {
    const p = buildGenerationPrompt({
      ...base, action: 'material', refKind: 'vista_mestre', hasIdentityImage: false,
      userIntent: '', userInstruction: 'trocar o piso para tauari claro', referenceLabel: null,
    })
    expect(p).toContain('SURGICAL MATERIAL SWAP')
    expect(p).toContain('except the one(s) the user explicitly asked to change')
  })

  it('detalhe: crop pode fechar, câmera nova é proibida', () => {
    const p = buildGenerationPrompt({
      ...base, action: 'detalhe', refKind: 'vista', hasIdentityImage: false,
      userIntent: 'close-up of the facade panel', referenceLabel: null,
    })
    expect(p).toContain('CLOSER CROP')
    expect(p).toContain('do not invent a new camera angle')
  })

  it('nova vista de mestre/histórico: câmera pode mover, projeto travado', () => {
    const p = buildGenerationPrompt({
      ...base, refKind: 'vista_mestre', hasIdentityImage: false,
      userIntent: 'view from the street corner', referenceLabel: null,
    })
    expect(p).toContain('ONLY the camera')
    expect(p).toContain('THE CAMERA MAY MOVE')
  })
})

describe('rótulos das partes de imagem (binding no caminho GCP)', () => {
  const dualRefs: ReferenceSet = {
    geometry: { kind: 'print', url: 'https://x/print.jpg', label: 'Fachada' },
    identity: { imageUrl: 'https://x/mestre.jpg', source: 'vista_mestre' },
  }
  const singleRefs: ReferenceSet = {
    geometry: { kind: 'vista_mestre', url: 'https://x/mestre.jpg' },
    identity: { imageUrl: null, source: 'same_as_geometry' },
  }

  it('dual: 2 rótulos paralelos às urls, papéis explícitos', () => {
    const labels = imagePartLabelsFor(dualRefs)
    expect(imageUrlsFor(dualRefs)).toHaveLength(2)
    expect(labels).toHaveLength(2)
    expect(labels[0]).toContain('Image #1')
    expect(labels[0]).toContain('GEOMETRIC REFERENCE')
    expect(labels[1]).toContain('Image #2')
    expect(labels[1]).toContain('VISUAL IDENTITY ONLY')
    expect(labels[1]).toContain('NEVER')
  })

  it('single: 1 rótulo só (identidade = geometria)', () => {
    expect(imageUrlsFor(singleRefs)).toHaveLength(1)
    expect(imagePartLabelsFor(singleRefs)).toHaveLength(1)
  })
})
