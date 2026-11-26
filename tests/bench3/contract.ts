// Contrato das camadas 1 (leitura) e 3 (conferência) do Renderizar 3.0.
//
// A leitura transforma o print num contrato VERIFICÁVEL: inventário numerado
// com bbox, materiais com evidência, câmera e luz. A conferência recebe esse
// inventário como checklist e responde item a item. Os schemas usam só o
// subconjunto comum aos três fornecedores (structured outputs da Anthropic,
// json_schema strict da OpenAI, responseJsonSchema do Gemini): todo campo é
// obrigatório e nenhum objeto aceita propriedade extra.

import type { BriefingArquitetonico } from '@/lib/prompts'

type Json = Record<string, unknown>
const obj = (properties: Record<string, Json>): Json => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
})
const str = (description?: string): Json => (description ? { type: 'string', description } : { type: 'string' })
const num: Json = { type: 'number' }
const bool: Json = { type: 'boolean' }
const arr = (items: Json): Json => ({ type: 'array', items })
const en = (values: string[]): Json => ({ type: 'string', enum: values })
const bbox: Json = { type: 'array', items: num, description: '[esquerda, topo, direita, base] normalizado 0..1' }

export const ITEM_KINDS = [
  'abertura', 'porta', 'esquadria', 'marcenaria', 'mobiliario', 'bancada', 'luminaria',
  'metal_louca', 'revestimento', 'estrutura', 'vegetacao', 'objeto', 'outro',
] as const

export const READ_SCHEMA = obj({
  tipo_input: en(['sketchup_sem_textura', 'sketchup_texturizado', 'render', 'foto', 'cad_linhas', 'outro']),
  tipo_projeto: str('ex.: cozinha residencial integrada; fachada de sobrado'),
  ambiente: en(['interior', 'exterior']),
  camera: obj({
    altura: en(['baixa', 'olho_humano', 'alta', 'aerea']),
    horizonte_y: { type: 'number', description: 'altura da linha do horizonte, 0 = topo, 1 = base' },
    pontos_de_fuga: { type: 'integer' },
    fov: en(['grande_angular', 'normal', 'tele']),
    descricao: str(),
  }),
  inventario: arr(obj({
    id: { type: 'integer' },
    tipo: en([...ITEM_KINDS]),
    descricao: str('o que é e onde está, em uma frase'),
    bbox,
    material: str('material/acabamento visível; "indefinido" se não der para afirmar'),
    evidencia: str('o que nos pixels sustenta a leitura'),
    critico: { type: 'boolean', description: 'se sumir ou mudar, o cliente percebe na hora' },
  })),
  superficies: arr(obj({
    superficie: str('piso, parede norte, teto, bancada…'),
    material: str(),
    cor: str(),
    evidencia: str(),
  })),
  luz: obj({
    fontes: arr(str()),
    luminarias_acesas: en(['sim', 'nao', 'indefinido']),
    periodo: en(['dia', 'entardecer', 'noite', 'indefinido']),
  }),
  ambiguidades: arr(str()),
})

export interface ReadItem {
  id: number; tipo: string; descricao: string; bbox: number[]; material: string; evidencia: string; critico: boolean
}
export interface ReadContract {
  tipo_input: string
  tipo_projeto: string
  ambiente: 'interior' | 'exterior'
  camera: { altura: string; horizonte_y: number; pontos_de_fuga: number; fov: string; descricao: string }
  inventario: ReadItem[]
  superficies: Array<{ superficie: string; material: string; cor: string; evidencia: string }>
  luz: { fontes: string[]; luminarias_acesas: string; periodo: string }
  ambiguidades: string[]
}

export const READ_SYSTEM = `You are the reading layer of an architectural rendering pipeline. You receive one screenshot of an architect's project (usually SketchUp). A later model will turn it into a photorealistic render, and a judge will check the render against what you list. Your output is a contract, not a description.

Rules:
- List every element whose disappearance, displacement or change would be noticed by the architect's client: openings, doors, window frames, cabinetry, furniture, countertops, light fixtures, fittings, structure, notable objects. Number them from 1.
- Bounding boxes are normalized [left, top, right, bottom] in 0..1 of the full image.
- Materials: state only what the pixels support. If a surface is untextured or ambiguous, write "indefinido" and explain in evidencia. Never invent a product or brand.
- Mark critico=true for items the client would notice at once.
- Put anything you cannot decide in ambiguidades instead of guessing.
- Write descriptions in Brazilian Portuguese.`

export const READ_USER = 'Leia este print e devolva o contrato no schema pedido.'

// ── Conferência ─────────────────────────────────────────────────────────────

export const JUDGE_SCHEMA = obj({
  itens: arr(obj({
    id: { type: 'integer' },
    presente: bool,
    mesma_posicao: bool,
    mesmo_material: bool,
    defeito: str('vazio se o item está correto'),
  })),
  extras_indevidos: arr(str('elemento que apareceu sem ter sido pedido')),
  camera_preservada: bool,
  geometria: { type: 'integer', description: '1 a 5' },
  materiais: { type: 'integer', description: '1 a 5' },
  luz: { type: 'integer', description: '1 a 5' },
  fotorrealismo: { type: 'integer', description: '1 a 5' },
  artefatos: arr(str()),
  veredito: en(['entregar', 'retry_localizado', 'trocar_motor']),
  correcao: str('instrução curta para o retry, nomeando os itens; vazio se entregar'),
})

export interface JudgeVerdict {
  itens: Array<{ id: number; presente: boolean; mesma_posicao: boolean; mesmo_material: boolean; defeito: string }>
  extras_indevidos: string[]
  camera_preservada: boolean
  geometria: number
  materiais: number
  luz: number
  fotorrealismo: number
  artefatos: string[]
  veredito: 'entregar' | 'retry_localizado' | 'trocar_motor'
  correcao: string
}

export const JUDGE_SYSTEM = `You are the quality gate of an architectural rendering service for Brazilian architects. Image 1 is the architect's original screenshot. Image 2 is the photorealistic render produced from it. The product promise: the render must be the SAME project — same camera, geometry, openings, furniture, layout and materials — only rendered photographically (better light, shadows, reflections, texture realism). A redesign is a failure even if it looks beautiful.

You get a numbered checklist read from the original. For every item, answer presente, mesma_posicao and mesmo_material by comparing both images. A material counts as the same when it is the same kind and colour family, rendered more realistically; untextured SketchUp surfaces may receive a plausible realistic finish of the same colour. Then:
- extras_indevidos: notable elements in image 2 that are not in image 1 (a little decor or vegetation is acceptable on exteriors; new furniture, openings or volumes are not).
- Scores 1–5: geometria, materiais, luz, fotorrealismo (5 = client-ready).
- veredito: "entregar" only if no critical item is missing, moved or changed, the camera is preserved and you would send this to the architect's client. "retry_localizado" if a few specific items fail and a corrective prompt could fix them. "trocar_motor" if the render is a redesign, the camera changed, or the problems are widespread.
- correcao: one short English instruction naming the failing items for a retry; empty when entregar.
Be strict: when in doubt about a critical item, it fails.`

export function judgeUser(contract: ReadContract): string {
  const lines = contract.inventario.map(i =>
    `#${i.id}${i.critico ? ' [CRÍTICO]' : ''} ${i.tipo}: ${i.descricao} — material: ${i.material} — bbox ${i.bbox.map(n => n.toFixed(2)).join(',')}`)
  return `Checklist do original (${contract.ambiente}, ${contract.tipo_projeto}; câmera: ${contract.camera.descricao}):\n${lines.join('\n')}\n\nCompare a imagem 1 (original) com a imagem 2 (render) e responda no schema.`
}

/** Contrato da camada 1 → briefing que o prompt de produção já sabe usar. */
export function contractToBriefing(c: ReadContract): BriefingArquitetonico {
  const of = (...kinds: string[]) => c.inventario.filter(i => kinds.includes(i.tipo)).map(i => i.descricao).join('; ')
  return {
    tipo_projeto: c.tipo_projeto,
    geometria_principal: of('estrutura') || c.tipo_projeto,
    volumes: of('estrutura', 'marcenaria'),
    pavimentos: 1,
    aberturas: of('abertura', 'porta', 'esquadria'),
    materiais_aparentes: c.superficies.map(s => `${s.superficie}: ${s.material}`).join('; '),
    camera: c.camera.descricao,
    entorno: of('vegetacao', 'objeto'),
    elementos_preservar: c.inventario.filter(i => i.critico).map(i => i.descricao),
    elementos_melhorar: ['realismo de materiais', 'iluminação', 'sombras e reflexos'],
  }
}

/** Veredito estrito derivado dos itens: protege contra juiz que diz "entregar" com item crítico falho. */
export function strictPass(v: JudgeVerdict, contract: ReadContract): boolean {
  const critical = new Set(contract.inventario.filter(i => i.critico).map(i => i.id))
  const criticalFail = v.itens.some(i => critical.has(i.id) && !(i.presente && i.mesma_posicao && i.mesmo_material))
  return v.veredito === 'entregar' && v.camera_preservada && !criticalFail
}
