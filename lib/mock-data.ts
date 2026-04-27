export type RenderStatus = 'done' | 'processing'

export type RenderJob = {
  id: string
  title: string      // sentence case, e.g. "sala de estar"
  subtitle: string   // "estilo · luz"
  status: RenderStatus
  dateLabel: string  // "HOJE" | "ONTEM" | "2 DIAS" | ...
  thumbGradient: string // CSS multi-layer gradient for the thumbnail
}

export const mockCredits = 47

// All gradients combine base + overlay layers into a single background property
// so no ::after pseudo-element is needed in React components.

export const mockRenders: RenderJob[] = [
  {
    id: '1',
    title: 'sala de estar',
    subtitle: 'contemporâneo · entardecer',
    status: 'done',
    dateLabel: 'HOJE',
    thumbGradient: [
      'linear-gradient(180deg, transparent 55%, rgba(60,40,25,0.25) 100%)',
      'radial-gradient(ellipse at 70% 30%, rgba(255,230,180,0.25) 0%, transparent 50%)',
      'linear-gradient(180deg, rgba(210,195,170,0) 0%, rgba(120,95,65,0.15) 100%)',
      'linear-gradient(135deg, #e8dccb 0%, #b8a688 45%, #8b7355 100%)',
    ].join(', '),
  },
  {
    id: '2',
    title: 'cozinha integrada',
    subtitle: 'escandinavo · manhã',
    status: 'done',
    dateLabel: 'ONTEM',
    thumbGradient: [
      'radial-gradient(ellipse at 30% 40%, rgba(255,240,220,0.35) 0%, transparent 55%)',
      'linear-gradient(180deg, rgba(240,235,228,0) 40%, rgba(90,80,65,0.2) 100%)',
      'linear-gradient(135deg, #f5f1ea 0%, #c4b8a4 60%, #7a6e5a 100%)',
    ].join(', '),
  },
  {
    id: '3',
    title: 'quarto master',
    subtitle: 'minimalista · manhã',
    status: 'done',
    dateLabel: '2 DIAS',
    thumbGradient: [
      'linear-gradient(45deg, rgba(180,140,90,0.2), transparent 60%)',
      'linear-gradient(180deg, rgba(240,228,210,0) 30%, rgba(100,75,50,0.25) 100%)',
      'linear-gradient(135deg, #f0e4d2 0%, #c9b690 50%, #857250 100%)',
    ].join(', '),
  },
  {
    id: '4',
    title: 'home office',
    subtitle: 'industrial · noite',
    status: 'done',
    dateLabel: '3 DIAS',
    thumbGradient: [
      'radial-gradient(ellipse at 80% 20%, rgba(220,180,120,0.2) 0%, transparent 40%)',
      'linear-gradient(180deg, rgba(100,110,120,0.05) 0%, rgba(25,30,40,0.5) 100%)',
      'linear-gradient(135deg, #8a8f97 0%, #4a5058 50%, #2a2f36 100%)',
    ].join(', '),
  },
  {
    id: '5',
    title: 'fachada residencial',
    subtitle: 'contemporâneo · entardecer',
    status: 'done',
    dateLabel: '5 DIAS',
    thumbGradient: [
      'radial-gradient(ellipse at 50% 100%, rgba(255,200,130,0.2) 0%, transparent 60%)',
      'linear-gradient(90deg, transparent 45%, rgba(0,0,0,0.05) 50%, transparent 55%)',
      'linear-gradient(180deg, rgba(200,195,185,0) 50%, rgba(80,75,65,0.3) 100%)',
      'linear-gradient(135deg, #dcd5c8 0%, #a89d8a 50%, #6b604d 100%)',
    ].join(', '),
  },
  {
    id: '6',
    title: 'escritório comercial',
    subtitle: 'minimalista · luz natural',
    status: 'done',
    dateLabel: 'SEMANA',
    thumbGradient: [
      'linear-gradient(180deg, transparent 40%, rgba(80,60,40,0.15) 100%)',
      'linear-gradient(180deg, rgba(230,225,215,0) 40%, rgba(90,80,65,0.22) 100%)',
      'linear-gradient(135deg, #e8e0d0 0%, #b8ab93 55%, #7d6f55 100%)',
    ].join(', '),
  },
]
