// Presets e chips do Prompt Assistant do modo Editar.
//
// Cada preset carrega um snippet de texto que é anexado ao prompt do usuário.
// Os snippets são em português — o backend processa o resultado e injeta as
// constraints técnicas em inglês (composeStandaloneFinalPrompt em edit-prompts.ts).
// Para o motor, o que vale é a riqueza descritiva: arquitetos descrevem em PT,
// o NB Pro / NB2 lidam bem com PT misturado a constraints técnicas em EN.

import type { EditMode } from './engines'

// ── Quick chips (reusable directives) ────────────────────────────────────────
// Atalho rápido que o usuário toca para anexar uma diretriz comum ao prompt.
// Sempre disponíveis, em qualquer modo.

export interface QuickChip {
  id:    string
  label: string
  /** Texto adicionado ao prompt do usuário quando o chip é ativado. */
  text:  string
}

export const QUICK_CHIPS: QuickChip[] = [
  { id: 'keep-geometry',    label: 'Manter geometria original',     text: 'manter geometria original' },
  { id: 'keep-lighting',    label: 'Manter iluminação',             text: 'manter iluminação da cena' },
  { id: 'keep-perspective', label: 'Manter perspectiva',            text: 'manter perspectiva e ângulo de câmera' },
  { id: 'mask-only',        label: 'Aplicar apenas na área pintada', text: 'aplicar apenas dentro da máscara, sem alterar o entorno' },
  { id: 'photorealistic',   label: 'Resultado fotorrealista',       text: 'resultado fotorrealista, alta fidelidade' },
  { id: 'keep-openings',    label: 'Não alterar portas e janelas',  text: 'não alterar portas, janelas, batentes e esquadrias' },
  { id: 'keep-structure',   label: 'Não alterar estrutura',         text: 'não alterar estrutura, pilares, vigas ou lajes do projeto' },
  { id: 'keep-style',       label: 'Manter estilo arquitetônico',   text: 'manter estilo arquitetônico do projeto' },
  { id: 'keep-scale',       label: 'Preservar escala',              text: 'preservar escala e proporção dos objetos existentes' },
]

// ── Presets per mode ─────────────────────────────────────────────────────────

export interface Preset {
  id:    string
  label: string
  /** Adicionado ao prompt quando o preset é selecionado. */
  text:  string
}

export interface PresetCategory {
  id:      string
  label:   string
  presets: Preset[]
}

const MATERIAL_PRESETS: PresetCategory[] = [
  {
    id: 'concrete', label: 'Concreto',
    presets: [
      { id: 'concrete-light',     label: 'Concreto aparente cinza claro', text: 'concreto aparente cinza claro com textura sutil de fôrma' },
      { id: 'concrete-brutalist', label: 'Concreto brutalista',           text: 'concreto aparente brutalista, juntas marcadas e textura áspera' },
      { id: 'micro-cement',       label: 'Microcimento',                  text: 'microcimento liso e contínuo em tom neutro' },
      { id: 'burnt-cement',       label: 'Cimento queimado',              text: 'cimento queimado com variações naturais de tom' },
    ],
  },
  {
    id: 'wood', label: 'Madeira',
    presets: [
      { id: 'oak',          label: 'Carvalho natural',  text: 'madeira de carvalho natural com veios visíveis' },
      { id: 'freijo',       label: 'Freijó',            text: 'madeira freijó em tom médio acastanhado' },
      { id: 'walnut',       label: 'Nogueira',          text: 'madeira nogueira escura com veios profundos' },
      { id: 'slatted-wood', label: 'Madeira ripada',    text: 'painel de madeira ripada com espaçamento regular' },
      { id: 'dark-wood',    label: 'Madeira escura',    text: 'madeira escura tipo ebanizada, acabamento fosco' },
    ],
  },
  {
    id: 'stone', label: 'Pedra',
    presets: [
      { id: 'travertine',   label: 'Mármore travertino', text: 'mármore travertino claro com veios horizontais característicos' },
      { id: 'white-marble', label: 'Mármore branco',     text: 'mármore branco polido com veios cinza sutis' },
      { id: 'black-granite', label: 'Granito preto',     text: 'granito preto absoluto polido' },
      { id: 'natural-stone', label: 'Pedra natural',     text: 'pedra natural rústica em tons quentes' },
      { id: 'quartzite',    label: 'Quartzito',          text: 'quartzito com veios claros e tonalidade neutra' },
    ],
  },
  {
    id: 'facade', label: 'Fachada',
    presets: [
      { id: 'acm-black',     label: 'ACM preto',           text: 'revestimento ACM preto fosco com juntas finas' },
      { id: 'metal-brise',   label: 'Brise metálico',      text: 'brise metálico vertical em alumínio escuro' },
      { id: 'wood-brise',    label: 'Brise de madeira',    text: 'brise de madeira vertical com espaçamento regular' },
      { id: 'moledo',        label: 'Pedra moledo',        text: 'pedra moledo natural assentada em juntas irregulares' },
      { id: 'white-paint',   label: 'Pintura branca',      text: 'pintura branca fosca lisa' },
      { id: 'cement-texture', label: 'Textura cimentícia', text: 'textura cimentícia rugosa em tom cinza médio' },
    ],
  },
  {
    id: 'floor', label: 'Pisos',
    presets: [
      { id: 'porc-satin',   label: 'Porcelanato acetinado',   text: 'porcelanato acetinado em formato grande, juntas mínimas' },
      { id: 'porc-marble',  label: 'Porcelanato marmorizado', text: 'porcelanato marmorizado claro com veios sutis' },
      { id: 'vinyl-wood',   label: 'Piso vinílico amadeirado', text: 'piso vinílico em padrão amadeirado claro' },
      { id: 'natural-stone-floor', label: 'Pedra natural',    text: 'piso em pedra natural rústica em tons neutros' },
      { id: 'polished-concrete', label: 'Concreto polido',    text: 'concreto polido contínuo em tom cinza médio' },
    ],
  },
]

const LANDSCAPE_PRESETS: PresetCategory[] = [
  {
    id: 'styles', label: 'Estilos',
    presets: [
      { id: 'tropical',       label: 'Jardim tropical',       text: 'jardim tropical denso com folhagens grandes e variadas' },
      { id: 'minimalist',     label: 'Jardim minimalista',    text: 'jardim minimalista com massas verdes uniformes e poucas espécies' },
      { id: 'mediterranean',  label: 'Mediterrâneo',          text: 'paisagismo mediterrâneo com oliveiras, alecrim e lavanda' },
    ],
  },
  {
    id: 'elements', label: 'Elementos',
    presets: [
      { id: 'low-vegetation', label: 'Vegetação baixa',       text: 'vegetação baixa e densa cobrindo o solo' },
      { id: 'tall-trees',     label: 'Árvores altas',         text: 'árvores altas de tronco delgado projetando sombra parcial' },
      { id: 'stone-bed',      label: 'Canteiro com pedras',   text: 'canteiro com pedras naturais grandes integradas à vegetação' },
      { id: 'arch-pots',      label: 'Vasos arquitetônicos',  text: 'vasos arquitetônicos cilíndricos em concreto com plantas estruturais' },
      { id: 'natural-grass',  label: 'Grama natural',         text: 'grama natural verde uniforme' },
    ],
  },
]

const LIGHTING_PRESETS: PresetCategory[] = [
  {
    id: 'mood', label: 'Atmosfera',
    presets: [
      { id: 'warm-indirect',  label: 'Luz quente indireta',   text: 'iluminação quente indireta, ambiente acolhedor' },
      { id: 'golden-hour',    label: 'Fim de tarde',          text: 'iluminação de fim de tarde, luz dourada rasante' },
      { id: 'soft-daylight',  label: 'Luz natural suave',     text: 'luz natural difusa, dia nublado com sombras suaves' },
      { id: 'night-arch',     label: 'Noite com iluminação arquitetônica', text: 'cena noturna com iluminação arquitetônica realçando volumes' },
    ],
  },
  {
    id: 'adjust', label: 'Ajustes',
    presets: [
      { id: 'softer-shadows', label: 'Sombras mais suaves',   text: 'sombras mais suaves e difusas' },
      { id: 'brighter',       label: 'Ambiente mais claro',   text: 'ambiente mais claro, exposição equilibrada' },
      { id: 'lit-facade',     label: 'Fachada iluminada',     text: 'fachada iluminada com fontes de luz integradas à arquitetura' },
    ],
  },
]

const FIX_PRESETS: PresetCategory[] = [
  {
    id: 'fixes', label: 'Correções',
    presets: [
      { id: 'remove-artifacts', label: 'Remover artefatos',     text: 'remover artefatos e ruído da imagem' },
      { id: 'fix-deformations', label: 'Corrigir deformações',  text: 'corrigir deformações e linhas tortas mantendo a geometria correta' },
      { id: 'clean-stains',     label: 'Limpar manchas',        text: 'limpar manchas e variações indesejadas de cor' },
      { id: 'fix-reflections',  label: 'Corrigir reflexos',     text: 'corrigir reflexos irreais ou inconsistentes' },
      { id: 'refine-edges',     label: 'Melhorar bordas',       text: 'refinar bordas e definição de contornos' },
      { id: 'refine-texture',   label: 'Refinar textura',       text: 'refinar textura mantendo coerência com o entorno' },
      { id: 'fix-vegetation',   label: 'Vegetação deformada',   text: 'corrigir vegetação com formas estranhas ou anatomia errada' },
      { id: 'fix-people',       label: 'Pessoas/objetos mal gerados', text: 'corrigir pessoas ou objetos com proporções ou anatomia incorretas' },
    ],
  },
]

export const PRESETS_BY_MODE: Partial<Record<EditMode, PresetCategory[]>> = {
  material:  MATERIAL_PRESETS,
  landscape: LANDSCAPE_PRESETS,
  lighting:  LIGHTING_PRESETS,
  fix:       FIX_PRESETS,
}

// ── Append helper ─────────────────────────────────────────────────────────────
// Adds a snippet to the user's prompt with sensible punctuation. Used by chips
// and presets so the resulting prompt reads naturally.

export function appendToPrompt(current: string, snippet: string): string {
  const trimmed = current.trim()
  if (!trimmed) return snippet
  // If the user's prompt already ends with punctuation, append directly.
  // Otherwise join with ". " so we don't run sentences together.
  if (/[.!?]$/.test(trimmed)) return `${trimmed} ${snippet}.`
  return `${trimmed}. ${snippet}.`
}
