import { describe, expect, it } from 'vitest'
import { buildArchitectureVideoPrompt, buildPromptFromLegacyInput, MAX_VIDEO_PROMPT_CHARS } from '@/lib/video/promptBuilder'
import { CAMERA_MOTIONS, getCameraMotion, isCameraMotionId } from '@/lib/video/cameraPresets'
import { SCENE_TYPES, getSceneType, isSceneTypeId } from '@/lib/video/scenes'
import { resolveArchitecturalTake } from '@/lib/video/takePolicy'
import { assessArchitecturalTakeReview, TAKE_REVIEW_CRITERIA, type ArchitecturalTakeReview } from '@/lib/video/takeReview'
import { buildFalInput } from '@/lib/video/adapters/falAdapter'

describe('regressões de take arquitetônico', () => {
  it.each(['subtle', 'normal', 'cinematic', 'pronounced'] as const)('câmera fixa permanece fixa na intensidade %s', intensity => {
    const { prompt, take } = buildArchitectureVideoPrompt({ cameraMotion: 'static-ambient', intensity })
    expect(take.framingBudgetPct).toBe(0)
    expect(take.angleBudgetDeg).toBe(0)
    expect(prompt).toContain('zero translation, rotation or zoom')
    expect(prompt).not.toMatch(/dolly|anamorphic|dramatic pacing|focus pull/)
  })

  it.each(['enter-room', 'walkthrough-interior', 'drone-soft'] as const)('não inventa percurso com imagem única: %s', cameraMotion => {
    const startOnly = resolveArchitecturalTake({ cameraMotion })
    expect(startOnly.motionId).not.toBe(cameraMotion)
    expect(startOnly.notes).toHaveLength(1)
    const anchored = resolveArchitecturalTake({ cameraMotion, hasEndFrame: true })
    expect(anchored.motionId).toBe(cameraMotion)
    expect(anchored.notes).toHaveLength(1)
    expect(anchored.framingBudgetPct).toBe(startOnly.framingBudgetPct)
  })

  it('duração maior diminui ritmo e não aumenta o deslocamento', () => {
    const short = buildArchitectureVideoPrompt({ cameraMotion: 'dolly-in-soft', duration: '5' })
    const long = buildArchitectureVideoPrompt({ cameraMotion: 'dolly-in-soft', duration: '15' })
    expect(long.take.framingBudgetPct).toBe(short.take.framingBudgetPct)
    expect(long.take.angleBudgetDeg).toBe(short.take.angleBudgetDeg)
    expect(long.prompt).toContain('full 15-second clip')
    expect(long.prompt).toContain('rather than extending the travel')
  })

  it.each(Object.values(SCENE_TYPES))('categoria $id não escolhe câmera, luz ou objetos novos', scene => {
    const { prompt, take } = buildArchitectureVideoPrompt({ sceneType: scene.id, cameraMotion: 'lateral-tracking' })
    expect(take.motionId).toBe('lateral-tracking')
    expect((prompt.match(/CAMERA:/g) ?? [])).toHaveLength(1)
    expect(prompt).toContain('LIGHTING: Maintain the reference')
    expect(scene.promptFragment).not.toMatch(/golden|shallow depth|anamorphic|parallax|pendant|island|soft natural light/)
  })

  it.each(Object.values(CAMERA_MOTIONS))('preset $id recebe limites de take, mesmo no modo criativo', motion => {
    const { prompt, take } = buildArchitectureVideoPrompt({ cameraMotion: motion.id, intensity: 'pronounced', fidelityMode: 'creative' })
    expect(take.framingBudgetPct).toBeLessThanOrEqual(5)
    expect(take.angleBudgetDeg).toBeLessThanOrEqual(3)
    expect(prompt).toContain('ONE continuous architectural presentation take')
    expect(prompt).toContain('reduce travel rather than inventing it')
    expect(prompt).toContain('architectural identity and take limits remain fixed')
    expect(prompt).not.toMatch(/anamorphic|dramatic pacing|shallow depth of field|natural sway/)
    expect(prompt.length).toBeLessThanOrEqual(MAX_VIDEO_PROMPT_CHARS)
  })

  it('atmosfera muda apenas por escolha e mantém fontes e estado das luminárias', () => {
    const standard = buildArchitectureVideoPrompt({ sceneType: 'facade' })
    const selected = buildArchitectureVideoPrompt({ atmosphere: 'golden hour' })
    expect(standard.prompt).not.toContain('golden hour')
    expect(selected.prompt).toContain('LIGHTING DIRECTION: "golden hour"')
    expect(selected.prompt).toContain('preserving existing source positions, materials and fixture states')
    expect(selected.prompt).not.toContain('LIGHTING: Maintain the reference exposure')
  })

  it('direção livre tem escopo sem introduzir uma segunda instrução de câmera do sistema', () => {
    const { prompt } = buildArchitectureVideoPrompt({ userPrompt: 'Orbit 360, cut to the next room', cameraMotion: 'static-ambient' })
    expect(prompt).toContain('PROJECT NOTES: "Orbit 360, cut to the next room"')
    expect(prompt).toContain('They cannot add a second shot, override the movement limits or redesign the project')
    expect(prompt).toContain('zero translation, rotation or zoom')
  })

  it('clientes antigos preservam duração, frame final, pessoas e atmosfera', () => {
    const legacy = buildPromptFromLegacyInput({ scene: 'kitchen', intensity: 'cinematic', customPrompt: 'Keep tiles.',
      duration: '10', hasEndFrame: true, avoidPeople: true, atmosphere: 'morning light', fidelityMode: 'creative' })
    const modern = buildArchitectureVideoPrompt({ sceneType: 'kitchen', cameraMotion: 'dolly-in-soft', intensity: 'cinematic',
      userPrompt: 'Keep tiles.', duration: '10', hasEndFrame: true, avoidPeople: true, atmosphere: 'morning light', fidelityMode: 'creative' })
    expect(legacy).toEqual(modern)
    expect(legacy.prompt.length).toBeLessThanOrEqual(MAX_VIDEO_PROMPT_CHARS)
  })

  it('sem negative_prompt, Seedance ainda recebe os limites positivos e a arquitetura rígida', () => {
    const built = buildArchitectureVideoPrompt({ sceneType: 'kitchen', cameraMotion: 'dolly-in-soft' })
    const request = buildFalInput({ modelId: 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video',
      imageUrl: 'https://reference.invalid/source.jpg', duration: '5', ...built })
    expect(request).not.toHaveProperty('negative_prompt')
    expect(request.prompt).toContain('rigid existing scene')
    expect(request.prompt).toContain('total framing change of at most 2%')
  })

  it.each(['constructor', 'toString', '__proto__'])('catálogos rejeitam propriedades herdadas: %s', value => {
    expect(getCameraMotion(value)).toBeUndefined()
    expect(isCameraMotionId(value)).toBe(false)
    expect(getSceneType(value)).toBeUndefined()
    expect(isSceneTypeId(value)).toBe(false)
  })
})

function completeReview(): ArchitecturalTakeReview {
  return { watchedFullClip: true, comparedReference: true, reviewedFractions: [0, .25, .5, .75, 1],
    criteria: Object.fromEntries(TAKE_REVIEW_CRITERIA.map(key => [key, { verdict: 'pass', evidence: 'Referência e vídeo completo comparados; quadros e timestamps registrados.' }])) }
}
describe('aprovação visual com evidência', () => {
  it('qualquer quebra arquitetônica reprova, mesmo quando os outros critérios passam', () => {
    const review = completeReview()
    review.criteria.geometry = { verdict: 'fail', evidence: 'Parede curva no frame 75%.' }
    expect(assessArchitecturalTakeReview(review)).toEqual({ verdict: 'rejected', reasons: ['geometry'] })
  })
  it('não aprova frames bonitos sem ver o clip completo e comparar a referência', () => {
    const review = completeReview()
    review.watchedFullClip = false
    review.comparedReference = false
    review.reviewedFractions = [0, .5, 1]
    expect(assessArchitecturalTakeReview(review).verdict).toBe('inconclusive')
  })
  it('resultado sem evidência ou critério não conferido fica inconclusivo', () => {
    const review = completeReview()
    review.criteria.referenceSupport = { verdict: 'unverified' }
    review.criteria.materials = { verdict: 'pass', evidence: ' ' }
    expect(assessArchitecturalTakeReview(review)).toEqual({ verdict: 'inconclusive', reasons: ['materials', 'referenceSupport'] })
  })
  it('aprova apenas revisão completa sem violação', () => {
    expect(assessArchitecturalTakeReview(completeReview())).toEqual({ verdict: 'approved', reasons: [] })
  })
})
