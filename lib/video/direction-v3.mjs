export const DIRECTION_VERSION = '3.0-pilot-1'

export const TAKES = Object.freeze({
  'aproximar': {
    label: 'Aproximar da cena',
    camera: 'A gentle forward dolly, with a short travel distance. Keep the original eye level, focal length, verticals and main subject centered within its original composition.',
  },
  'deslizar': {
    label: 'Deslizar de lado',
    camera: 'A very short left-to-right lateral camera slide with subtle parallax. Hold eye level, focal length and orientation. Keep the move within the field supported by the reference.',
  },
  'revelar-fachada': {
    label: 'Revelar a fachada',
    camera: 'A shallow lateral arc around the visible elevation, with verticals upright, no tilt and no excursion behind any edge of the building. Keep the facade and its full silhouette legible.',
  },
  'aproximar-detalhe': {
    label: 'Mostrar um detalhe',
    camera: 'A tight, gentle push toward the supplied focal detail. Keep it sharply legible at the original focal plane. Preserve texture scale and alignment, seams and existing finish.',
  },
  'camera-fixa': {
    label: 'Manter a câmera fixa',
    camera: 'A completely locked tripod shot. Hold position, framing, orientation, focal length and focus fixed for the entire take.',
  },
  'duas-vistas': {
    label: 'Conectar duas vistas',
    camera: 'Bridge the two supplied views with one short and physically continuous camera move. Match the respective start and end compositions and keep every visible architectural anchor consistent throughout.',
  },
})

export function buildDirection({ take, anchors, finalFrame = false, ambient = 'none' }) {
  if (!Object.hasOwn(TAKES, take)) throw new Error('Take desconhecido.')
  if ((take === 'duas-vistas') !== finalFrame) throw new Error('Conectar duas vistas exige um segundo quadro da mesma cena.')
  if (!['none', 'vegetation', 'water'].includes(ambient)) throw new Error('Movimento de ambiente desconhecido.')
  if (take === 'camera-fixa' && ambient === 'none') throw new Error('Selecione água ou vegetação que já esteja no quadro para animar com câmera fixa.')
  if (!Array.isArray(anchors) || anchors.length > 5 || anchors.some(anchor => typeof anchor !== 'string' || !anchor.trim() || anchor.length > 90)) {
    throw new Error('Use até cinco âncoras arquitetônicas com até 90 caracteres cada.')
  }

  const sceneMotion = {
    none: 'Keep the visible environment still.',
    vegetation: 'Allow restrained motion only in existing foliage; keep all architecture and other subjects stationary.',
    water: 'Allow gentle ripples only in existing water; keep all architecture and other subjects stationary.',
  }[ambient]

  return [
    'Create a single continuous, stabilized architectural shot beginning with the supplied image. Preserve its original visual style, with continuous motion and no cuts or transitions.',
    TAKES[take].camera,
    'Keep building massing, wall and opening positions, grout lines, joinery, furniture, materials, illumination and light fixtures identical to the reference. Straight edges stay straight and surfaces stay rigid. Retain the same objects throughout; exclude new people, vehicles, furniture and reflections of unseen areas.',
    anchors.length ? `Preserve these visible anchors in particular: ${anchors.map(anchor => anchor.trim()).join('; ')}.` : '',
    sceneMotion,
    'Silent architectural footage, with no narration, music or sound effects.',
  ].filter(Boolean).join('\n')
}

export const PROFILES = Object.freeze({
  'kling25-1080': { label: 'Kling 2.5 Turbo Pro', endpoint: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video', resolution: '1080p', usd: 0.35 },
  'h3-max-768': { label: 'MiniMax H3 Max', endpoint: 'minimax/h3-max/image-to-video', resolution: '768p', usd: 0.40 },
  'kling4-720': { label: 'Kling 4.0', endpoint: 'kling/v4/image-to-video', resolution: '720p', usd: 0.785 },
  'kling4-1080': { label: 'Kling 4.0', endpoint: 'kling/v4/image-to-video', resolution: '1080p', usd: 1.175 },
  'seedance25-720': { label: 'Seedance 2.5 US', endpoint: 'bytedance/seedance-2.5/us/image-to-video', resolution: '720p', usd: 2.365 },
})

export function buildProviderRequest({ profile, imageUrl, endUrl, take, anchors, ambient }) {
  if (!Object.hasOwn(PROFILES, profile)) throw new Error('Motor desconhecido.')
  if (typeof imageUrl !== 'string' || !/^(?:https:\/\/|data:image\/)/.test(imageUrl)) throw new Error('Imagem inicial inválida.')
  const { endpoint, resolution } = PROFILES[profile]
  const prompt = buildDirection({ take, anchors, ambient, finalFrame: Boolean(endUrl) })
  const firstFrame = { image_url: imageUrl }
  const lastFrame = endUrl ? { end_image_url: endUrl } : {}
  let input
  switch (endpoint) {
    case 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video':
      input = { ...firstFrame, ...(endUrl ? { tail_image_url: endUrl } : {}), prompt, duration: '5', cfg_scale: 0.75,
        negative_prompt: 'bent lines, warped geometry, drifting textures, flashing lights, cuts, added objects, shake, redesign' }
      break
    case 'minimax/h3-max/image-to-video':
      input = { ...firstFrame, ...lastFrame, prompt, duration: 5, resolution: resolution.toUpperCase(), prompt_expansion_mode: 'disabled' }
      break
    case 'kling/v4/image-to-video':
      input = { start_image_url: imageUrl, ...lastFrame, prompt, duration: 5, resolution }
      break
    case 'bytedance/seedance-2.5/us/image-to-video':
      input = { ...firstFrame, ...lastFrame, prompt, duration: '5', resolution, aspect_ratio: 'auto', generate_audio: false }
      break
  }
  return { endpoint, input }
}

export const ESSENCE_ANNUAL = Object.freeze({
  monthlyBRL: 111.75,
  monthlyNodes: 800,
  minimumMargin: 0.70,
  effectiveFX: 6,
  revenueDeduction: 0.05,
  billedOverhead: 0.15,
  deliveryUSD: 0.02,
})

export function calculateEconomics(providerUSD, { observed = false } = {}) {
  if (!Number.isFinite(providerUSD) || providerUSD < 0) throw new Error('Custo do provedor inválido.')
  const { monthlyBRL, monthlyNodes, minimumMargin, effectiveFX, revenueDeduction, billedOverhead, deliveryUSD } = ESSENCE_ANNUAL
  const netPerNode = monthlyBRL * (1 - revenueDeduction) / monthlyNodes
  const effectiveCostBRL = (providerUSD * (observed ? 1 : 1 + billedOverhead) + deliveryUSD) * effectiveFX
  const nodes = Math.ceil(effectiveCostBRL / (netPerNode * (1 - minimumMargin)) / 5) * 5
  return { nodes, margin: 1 - effectiveCostBRL / (nodes * netPerNode), effectiveCostBRL, fitsMonthlyAllowance: nodes <= monthlyNodes }
}
