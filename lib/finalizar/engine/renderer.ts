// lib/finalizar/engine/renderer.ts — motor de renderização do Finalizar.
//
// WebGL2, não destrutivo e em tempo real: o documento descreve os ajustes e
// cada frame re-renderiza a partir da base. Pipeline (ver shaders.ts):
//   base ─GEOMETRY→ cena ─ELEMENT×n→ cena ─COLOR(+locais)→ ─BLUR/FINISH→ canvas
//
// Performance: uploads de textura só quando algo MUDA (base, elementos,
// máscaras); arrastar um slider atualiza apenas uniforms — o custo por frame é
// o dos passes de fragment shader. Blur/detalhe são pulados quando nitidez,
// ruído e clareza estão zerados.
//
// Orientação: DOM (y para baixo) vs GL (y para cima) — todos os uploads de
// canvas/imagem usam UNPACK_FLIP_Y_WEBGL; parâmetros analíticos vindos do
// documento (y para baixo) são convertidos aqui ao definir uniforms.

import type { FinalizeDoc, LocalAdjustment } from '../types'
import { MAX_LOCAL_ADJUSTMENTS } from '../types'
import { isCurveIdentity } from '../composition'
import { curveToLut, geometryUniforms } from './color-math'
import { MaskRasterizer, type LiveStroke } from './masks'
import {
  FRAG_BLUR, FRAG_COLOR, FRAG_COPY, FRAG_ELEMENT, FRAG_FINISH, FRAG_GEOMETRY, VERT_FULLSCREEN,
} from './shaders'

const N = MAX_LOCAL_ADJUSTMENTS

export interface RenderLive {
  /** Traço em andamento sobre uma máscara local. */
  local?: { id: string; stroke: LiveStroke } | null
  /** Traço em andamento sobre a máscara de um elemento. */
  element?: { id: string; stroke: LiveStroke } | null
}

interface ProgramInfo {
  prog: WebGLProgram
  loc: Map<string, WebGLUniformLocation | null>
}

interface TexEntry {
  tex: WebGLTexture
  width: number
  height: number
  img?: HTMLImageElement
  loaded: boolean
  failed: boolean
}

export class FinalizeRenderer {
  readonly canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext | null
  private programs = new Map<string, ProgramInfo>()
  private quad: WebGLBuffer | null = null

  private baseTex: WebGLTexture | null = null
  private baseW = 0
  private baseH = 0
  /** Fonte da base para reupload após restauração de contexto. */
  private baseSource: HTMLImageElement | ImageBitmap | null = null

  /** 4 FBOs full-res + 2 quarter-res, alocados sob demanda. */
  private fbos: { fbo: WebGLFramebuffer; tex: WebGLTexture }[] = []
  private smallFbos: { fbo: WebGLFramebuffer; tex: WebGLTexture }[] = []
  private fboW = 0
  private fboH = 0
  /** Intermediários em RGBA16F (probe no setup; false = RGBA8 clássico). */
  private floatFbos = false

  private curveTex: WebGLTexture | null = null
  private curveKey = ''
  private dummyTex: WebGLTexture | null = null
  private localTex: (WebGLTexture | null)[] = new Array(N).fill(null)
  /** Última fonte enviada por slot — o rasterizador devolve o MESMO canvas
   *  quando nada mudou, então identidade de referência é o gate de upload. */
  private localTexSrc: (HTMLCanvasElement | null)[] = new Array(N).fill(null)
  private elemMaskTex = new Map<string, { tex: WebGLTexture; src: HTMLCanvasElement | null }>()

  private images = new Map<string, TexEntry>()
  readonly masks = new MaskRasterizer()

  private onNeedsRender: () => void
  private contextLost = false
  private disposed = false

  constructor(canvas: HTMLCanvasElement, onNeedsRender: () => void = () => {}) {
    this.canvas = canvas
    this.onNeedsRender = onNeedsRender
    this.gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    })
    if (this.gl) this.setup()
    this.masks.onImageLoaded = () => this.onNeedsRender()

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      this.contextLost = true
    })
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false
      this.resetGlObjects()
      if (this.gl) {
        this.setup()
        // Re-envia a base (o viewport só chama setBaseImage quando a URL muda).
        if (this.baseSource) this.setBaseImage(this.baseSource, this.baseW, this.baseH)
      }
      this.onNeedsRender()
    })
  }

  isSupported(): boolean {
    return this.gl !== null
  }

  maxTextureSize(): number {
    return this.gl ? (this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number) : 4096
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  private setup() {
    const gl = this.gl!
    const compile = (name: string, frag: string) => {
      const prog = buildProgram(gl, VERT_FULLSCREEN, frag)
      if (prog) this.programs.set(name, { prog, loc: new Map() })
    }
    compile('geometry', FRAG_GEOMETRY)
    compile('element', FRAG_ELEMENT)
    compile('color', FRAG_COLOR)
    compile('blur', FRAG_BLUR)
    compile('finish', FRAG_FINISH)
    compile('copy', FRAG_COPY)

    this.quad = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)

    this.dummyTex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.dummyTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]))
    setTexParams(gl)

    // FBOs float16 quando o driver renderiza em RGBA16F (o canvas final segue
    // 8-bit). Probe real com checkFramebufferStatus: extensão presente não
    // garante FBO completo em todo driver — incompleto = fica no RGBA8 de
    // sempre (comportamento idêntico ao anterior).
    this.floatFbos = false
    if (gl.getExtension('EXT_color_buffer_float')) {
      const probe = makeFbo(gl, 4, 4, true)
      gl.bindFramebuffer(gl.FRAMEBUFFER, probe.fbo)
      this.floatFbos = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.deleteFramebuffer(probe.fbo)
      gl.deleteTexture(probe.tex)
    }
  }

  /** Textura de máscara de um elemento — upload só quando o canvas do
   *  rasterizador muda de referência (cache CPU devolve o mesmo objeto). */
  private elementMaskTexture(id: string, canvas: HTMLCanvasElement): WebGLTexture {
    const gl = this.gl!
    let entry = this.elemMaskTex.get(id)
    if (!entry) {
      entry = { tex: gl.createTexture()!, src: null }
      this.elemMaskTex.set(id, entry)
    }
    if (entry.src !== canvas) {
      uploadTexture(gl, entry.tex, canvas)
      entry.src = canvas
    }
    return entry.tex
  }

  /** Libera texturas de elementos removidos do documento. */
  private pruneElementMasks(liveIds: Set<string>) {
    const gl = this.gl!
    for (const [id, entry] of Array.from(this.elemMaskTex.entries())) {
      if (!liveIds.has(id)) {
        gl.deleteTexture(entry.tex)
        this.elemMaskTex.delete(id)
      }
    }
  }

  private resetGlObjects() {
    this.programs.clear()
    this.fbos = []
    this.smallFbos = []
    this.fboW = 0
    this.fboH = 0
    this.baseTex = null
    this.curveTex = null
    this.curveKey = ''
    this.dummyTex = null
    this.localTex = new Array(N).fill(null)
    this.localTexSrc = new Array(N).fill(null)
    this.elemMaskTex.clear()
    for (const e of this.images.values()) e.loaded = e.failed ? e.loaded : false
    // Reaproveita os HTMLImageElements já baixados — só recria texturas.
    for (const e of this.images.values()) {
      if (e.img && e.img.complete && !e.failed) {
        e.tex = null as unknown as WebGLTexture
        e.loaded = false
      }
    }
  }

  // ── Imagens (base + elementos) ─────────────────────────────────────────────

  setBaseImage(img: HTMLImageElement | ImageBitmap, w: number, h: number): void {
    this.baseSource = img
    this.baseW = w
    this.baseH = h
    const gl = this.gl
    if (!gl) return
    if (!this.baseTex) this.baseTex = gl.createTexture()
    uploadTexture(gl, this.baseTex!, img)
  }

  /** Garante a textura de uma URL (elemento); carrega assíncrono e re-renderiza. */
  private ensureImage(url: string): TexEntry | null {
    const gl = this.gl
    if (!gl) return null
    let entry = this.images.get(url)
    if (entry) {
      if (entry.loaded) return entry
      if (entry.failed) return null
      if (entry.img && entry.img.complete && entry.img.naturalWidth > 0 && !entry.loaded) {
        // contexto restaurado: recria a textura
        entry.tex = gl.createTexture()!
        uploadTexture(gl, entry.tex, entry.img)
        entry.width = entry.img.naturalWidth
        entry.height = entry.img.naturalHeight
        entry.loaded = true
        return entry
      }
      return null
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    entry = { tex: gl.createTexture()!, width: 0, height: 0, img, loaded: false, failed: false }
    this.images.set(url, entry)
    img.onload = () => {
      if (this.disposed || !this.gl) return
      uploadTexture(this.gl, entry!.tex, img)
      entry!.width = img.naturalWidth
      entry!.height = img.naturalHeight
      entry!.loaded = true
      this.onNeedsRender()
    }
    img.onerror = () => {
      entry!.failed = true
      this.onNeedsRender()
    }
    img.src = url
    return null
  }

  elementImageSize(url: string): { w: number; h: number } | null {
    const e = this.images.get(url)
    return e?.loaded ? { w: e.width, h: e.height } : null
  }

  // ── FBOs ───────────────────────────────────────────────────────────────────

  private ensureFbos(w: number, h: number) {
    const gl = this.gl!
    if (this.fboW === w && this.fboH === h && this.fbos.length === 4) return
    for (const f of [...this.fbos, ...this.smallFbos]) {
      gl.deleteFramebuffer(f.fbo)
      gl.deleteTexture(f.tex)
    }
    this.fbos = []
    this.smallFbos = []
    for (let i = 0; i < 4; i++) this.fbos.push(makeFbo(gl, w, h, this.floatFbos))
    const sw = Math.max(2, Math.round(w / 4))
    const sh = Math.max(2, Math.round(h / 4))
    for (let i = 0; i < 2; i++) this.smallFbos.push(makeFbo(gl, sw, sh, this.floatFbos))
    this.fboW = w
    this.fboH = h
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  /** Renderiza o documento no canvas do renderer. Retorna false se WebGL
   *  indisponível ou base ainda não carregada. */
  render(doc: FinalizeDoc, live?: RenderLive): boolean {
    const gl = this.gl
    if (!gl || this.contextLost || !this.baseTex || this.canvas.width < 2) return false
    const W = this.canvas.width
    const H = this.canvas.height
    this.ensureFbos(W, H)

    const aspect = W / Math.max(1, H)
    gl.disable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)

    // ── 1. Cena: geometria + elementos ──────────────────────────────────────
    const geo = geometryUniforms(doc.geometry, aspect)
    const visibleElements = doc.elements.filter((e) => e.visible && e.opacity > 0.001)
    let sceneTex: WebGLTexture = this.baseTex
    let sceneIdx = -1

    if (!geo.identity || visibleElements.length > 0) {
      let cur = 0
      if (!geo.identity) {
        this.bindTarget(this.fbos[cur].fbo, W, H)
        const p = this.use('geometry')
        this.bindTex(p, 'uTex', 0, this.baseTex)
        gl.uniformMatrix3fv(this.u(p, 'uInvH'), false, geo.invH)
        gl.uniform1f(this.u(p, 'uLensK'), geo.lensK)
        gl.uniform1f(this.u(p, 'uCoverScale'), geo.coverScale)
        gl.uniform1f(this.u(p, 'uAspect'), aspect)
        this.draw()
      } else {
        this.bindTarget(this.fbos[cur].fbo, W, H)
        const p = this.use('copy')
        this.bindTex(p, 'uTex', 0, this.baseTex)
        this.draw()
      }

      this.pruneElementMasks(new Set(doc.elements.map((e) => e.id)))
      for (const el of visibleElements) {
        const entry = this.ensureImage(el.url)
        if (!entry) continue // carrega em background; re-render virá
        const next = cur === 0 ? 1 : 0
        const liveStroke = live?.element && live.element.id === el.id ? live.element.stroke : null
        const maskCanvas = this.masks.elementMask(el, this.baseW, this.baseH, liveStroke)
        const maskTex = this.elementMaskTexture(el.id, maskCanvas)

        this.bindTarget(this.fbos[next].fbo, W, H)
        const p = this.use('element')
        this.bindTex(p, 'uDst', 0, this.fbos[cur].tex)
        this.bindTex(p, 'uElem', 1, entry.tex)
        this.bindTex(p, 'uElemMask', 2, maskTex)
        const t = el.transform
        const elAspect = entry.width / Math.max(1, entry.height)
        const halfW = t.width / 2
        const halfH = (t.width / elAspect) * aspect / 2
        gl.uniform2f(this.u(p, 'uCenter'), t.x, 1 - t.y)
        gl.uniform2f(this.u(p, 'uHalfSize'), halfW, halfH)
        gl.uniform1f(this.u(p, 'uRotation'), (-t.rotation * Math.PI) / 180)
        gl.uniform2f(this.u(p, 'uFlip'), t.flipH ? -1 : 1, t.flipV ? -1 : 1)
        gl.uniform1f(this.u(p, 'uOpacity'), el.opacity)
        gl.uniform1i(this.u(p, 'uBlend'), BLEND_INDEX[el.blendMode] ?? 0)
        gl.uniform1f(this.u(p, 'uAspect'), aspect)
        const cm = el.colorMatch
        gl.uniform3f(this.u(p, 'uElemGain'), cm?.gain[0] ?? 1, cm?.gain[1] ?? 1, cm?.gain[2] ?? 1)
        gl.uniform3f(this.u(p, 'uElemOffset'), cm?.offset[0] ?? 0, cm?.offset[1] ?? 0, cm?.offset[2] ?? 0)
        gl.uniform1f(this.u(p, 'uElemMatch'), cm ? cm.amount / 100 : 0)
        this.draw()
        cur = next
      }
      sceneTex = this.fbos[cur].tex
      sceneIdx = cur
    }

    // ── 2. Máscaras locais → texturas + dados de uniform ────────────────────
    const locals = doc.locals.slice(0, N)
    const localData = locals.map((l, i) => this.prepareLocal(l, i, live?.local?.id === l.id ? live!.local!.stroke : null))

    // ── 3. Curva LUT ─────────────────────────────────────────────────────────
    const curveActive = !isCurveIdentity(doc.curve)
    if (curveActive) this.ensureCurve(doc)

    // ── 4. COLOR → fbo[2] ───────────────────────────────────────────────────
    const colorIdx = sceneIdx === 2 ? 3 : 2
    this.bindTarget(this.fbos[colorIdx].fbo, W, H)
    {
      const p = this.use('color')
      this.bindTex(p, 'uTex', 0, sceneTex)
      this.bindTex(p, 'uCurveLut', 1, curveActive ? this.curveTex! : this.dummyTex!)
      this.setLocalUniforms(p, localData, 2)

      const a = doc.adjust
      gl.uniform4f(this.u(p, 'uAdjA'), a.exposure / 100, a.contrast / 100, a.highlights / 100, a.shadows / 100)
      gl.uniform4f(this.u(p, 'uAdjB'), a.whites / 100, a.blacks / 100, a.temperature / 100, a.tint / 100)
      const hslActive = Object.values(doc.hsl).some((b) => b.hue !== 0 || b.sat !== 0 || b.lum !== 0)
      gl.uniform4f(this.u(p, 'uAdjC'), a.saturation / 100, a.vibrance / 100, curveActive ? 1 : 0, hslActive ? 1 : 0)

      const m = doc.colorMatch
      gl.uniform3f(this.u(p, 'uMatchGain'), m?.gain[0] ?? 1, m?.gain[1] ?? 1, m?.gain[2] ?? 1)
      gl.uniform3f(this.u(p, 'uMatchOffset'), m?.offset[0] ?? 0, m?.offset[1] ?? 0, m?.offset[2] ?? 0)
      gl.uniform1f(this.u(p, 'uMatchAmount'), m ? m.amount / 100 : 0)

      const hslArr = new Float32Array(8 * 3)
      const bandOrder = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'] as const
      bandOrder.forEach((band, i) => {
        const b = doc.hsl[band]
        hslArr[i * 3] = b.hue / 100
        hslArr[i * 3 + 1] = b.sat / 100
        hslArr[i * 3 + 2] = b.lum / 100
      })
      gl.uniform3fv(this.u(p, 'uHsl[0]'), hslArr)

      const g = doc.grading
      const gradeActive = g.shadows.sat > 0 || g.midtones.sat > 0 || g.highlights.sat > 0
        || g.shadows.lum !== 0 || g.midtones.lum !== 0 || g.highlights.lum !== 0
      const wheel = (wh: { hue: number; sat: number }): [number, number, number] => {
        const rgb = hsvToRgb(wh.hue / 360, 1, 1)
        const l = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
        const s = (wh.sat / 100) * 0.18
        return [(rgb[0] - l) * s, (rgb[1] - l) * s, (rgb[2] - l) * s]
      }
      gl.uniform3f(this.u(p, 'uGradeShadowColor'), ...wheel(g.shadows))
      gl.uniform3f(this.u(p, 'uGradeMidColor'), ...wheel(g.midtones))
      gl.uniform3f(this.u(p, 'uGradeHighColor'), ...wheel(g.highlights))
      gl.uniform3f(this.u(p, 'uGradeLum'), g.shadows.lum / 100, g.midtones.lum / 100, g.highlights.lum / 100)
      gl.uniform2f(this.u(p, 'uGradeRange'), g.blending / 100, g.balance / 100)
      gl.uniform1f(this.u(p, 'uGradeActive'), gradeActive ? 1 : 0)
      this.draw()
    }

    // ── 5. Detalhe: blur fino (full) + grosso (¼) ───────────────────────────
    const anyLocalDetail = locals.some((l, i) => localData[i].mode !== 0 && (l.values.sharpness !== 0 || l.values.clarity !== 0))
    const detailActive = doc.adjust.sharpen > 0 || doc.adjust.noiseReduction > 0 || doc.adjust.clarity !== 0 || anyLocalDetail
    let fineTex = this.dummyTex!
    let coarseTex = this.dummyTex!
    if (detailActive) {
      const tmpIdx = [0, 1, 2, 3].find((i) => i !== sceneIdx && i !== colorIdx)!
      const fineIdx = [0, 1, 2, 3].find((i) => i !== sceneIdx && i !== colorIdx && i !== tmpIdx)!
      // fino
      this.blurPass(this.fbos[colorIdx].tex, this.fbos[tmpIdx], W, H, 1 / W, 0)
      this.blurPass(this.fbos[tmpIdx].tex, this.fbos[fineIdx], W, H, 0, 1 / H)
      fineTex = this.fbos[fineIdx].tex
      // grosso (¼ res, blur duplo)
      const sw = this.smallFbos[0] ? Math.max(2, Math.round(W / 4)) : 0
      const sh = Math.max(2, Math.round(H / 4))
      this.bindTarget(this.smallFbos[0].fbo, sw, sh)
      const pc = this.use('copy')
      this.bindTex(pc, 'uTex', 0, this.fbos[colorIdx].tex)
      this.draw()
      this.blurPass(this.smallFbos[0].tex, this.smallFbos[1], sw, sh, 1 / sw, 0)
      this.blurPass(this.smallFbos[1].tex, this.smallFbos[0], sw, sh, 0, 1 / sh)
      this.blurPass(this.smallFbos[0].tex, this.smallFbos[1], sw, sh, 1.5 / sw, 0)
      this.blurPass(this.smallFbos[1].tex, this.smallFbos[0], sw, sh, 0, 1.5 / sh)
      coarseTex = this.smallFbos[0].tex
    }

    // ── 6. FINISH → tela ─────────────────────────────────────────────────────
    this.bindTarget(null, W, H)
    {
      const p = this.use('finish')
      this.bindTex(p, 'uTex', 0, this.fbos[colorIdx].tex)
      this.bindTex(p, 'uScene', 1, sceneTex)
      this.bindTex(p, 'uFine', 2, fineTex)
      this.bindTex(p, 'uCoarse', 3, coarseTex)
      this.setLocalUniforms(p, localData, 4)
      gl.uniform4f(
        this.u(p, 'uDetail'),
        doc.adjust.sharpen / 100,
        doc.adjust.noiseReduction / 100,
        doc.adjust.clarity / 100,
        detailActive ? 1 : 0,
      )
      const v = doc.vignette
      gl.uniform4f(
        this.u(p, 'uVignette'),
        v.amount / 100,
        (v.size / 100) * 0.9,
        Math.max(0.02, v.feather / 100),
        v.amount !== 0 ? 1 : 0,
      )
      gl.uniform1f(this.u(p, 'uTreatment'), doc.treatmentAmount / 100)
      this.draw()
    }
    return true
  }

  // ── Locais: texturas + uniforms ────────────────────────────────────────────

  private prepareLocal(l: LocalAdjustment, slot: number, live: LiveStroke | null): {
    mode: number
    invert: number
    p0: [number, number, number, number]
    p1: [number, number, number, number]
    adjA: [number, number, number, number]
    adjB: [number, number, number, number]
    adjC: [number, number, number, number]
    tex: WebGLTexture
  } {
    const gl = this.gl!
    let mode = 0
    let p0: [number, number, number, number] = [0, 0, 0, 0]
    let p1: [number, number, number, number] = [0, 0, 0, 0]
    const s = l.shape
    if (l.enabled) {
      switch (s.kind) {
        case 'brush': mode = 1; break
        case 'sky': mode = 1; break
        case 'linear': mode = 2; p0 = [s.x0, 1 - s.y0, s.x1, 1 - s.y1]; break
        case 'radial': mode = 3; p0 = [s.cx, 1 - s.cy, s.rx, s.ry]; p1 = [s.feather, 0, 0, 0]; break
        case 'luminosity': mode = 4; p0 = [s.min, s.max, Math.max(0.01, s.smooth), 0]; break
      }
    }
    p1[1] = l.density / 100 // densidade (teto do efeito da máscara)

    // Textura de traços (R=add, G=erase) — só quando há traços/bake/live.
    let tex = this.dummyTex!
    const needsTex = mode !== 0 && (l.strokes.length > 0 || live || (s.kind === 'sky' && s.bakedUrl))
    if (needsTex) {
      // O rasterizador devolve o MESMO canvas quando nada mudou — identidade
      // de referência cobre conteúdo (traços, bake carregado, live) sem chave.
      const canvas = this.masks.localMask(l, this.baseW, this.baseH, live)
      if (!this.localTex[slot]) this.localTex[slot] = gl.createTexture()
      if (this.localTexSrc[slot] !== canvas) {
        uploadTexture(gl, this.localTex[slot]!, canvas)
        this.localTexSrc[slot] = canvas
      }
      tex = this.localTex[slot]!
    } else {
      // Sem textura neste estado (ex.: "Limpar traços") — invalida o gate para
      // que um estado futuro com o mesmo canvas não pule o upload.
      this.localTexSrc[slot] = null
    }

    const v = l.values
    return {
      mode,
      invert: l.invert ? 1 : 0,
      p0,
      p1,
      adjA: [v.exposure / 100, v.contrast / 100, v.highlights / 100, v.shadows / 100],
      adjB: [v.temperature / 100, v.tint / 100, v.saturation / 100, v.clarity / 100],
      adjC: [v.sharpness / 100, 0, 0, 0],
      tex,
    }
  }

  private setLocalUniforms(p: ProgramInfo, data: ReturnType<FinalizeRenderer['prepareLocal']>[], unitStart: number) {
    const gl = this.gl!
    const modes = new Int32Array(N)
    const inverts = new Float32Array(N)
    const p0 = new Float32Array(N * 4)
    const p1 = new Float32Array(N * 4)
    const adjA = new Float32Array(N * 4)
    const adjB = new Float32Array(N * 4)
    const adjC = new Float32Array(N * 4)
    for (let i = 0; i < N; i++) {
      const d = data[i]
      modes[i] = d ? d.mode : 0
      inverts[i] = d ? d.invert : 0
      if (d) {
        p0.set(d.p0, i * 4)
        p1.set(d.p1, i * 4)
        adjA.set(d.adjA, i * 4)
        adjB.set(d.adjB, i * 4)
        adjC.set(d.adjC, i * 4)
      }
      this.bindTex(p, `uLocalTex${i}`, unitStart + i, d ? d.tex : this.dummyTex!)
    }
    gl.uniform1iv(this.u(p, 'uLocalMode[0]'), modes)
    gl.uniform1fv(this.u(p, 'uLocalInvert[0]'), inverts)
    gl.uniform4fv(this.u(p, 'uLocalP0[0]'), p0)
    gl.uniform4fv(this.u(p, 'uLocalP1[0]'), p1)
    gl.uniform4fv(this.u(p, 'uLocalAdjA[0]'), adjA)
    gl.uniform4fv(this.u(p, 'uLocalAdjB[0]'), adjB)
    gl.uniform4fv(this.u(p, 'uLocalAdjC[0]'), adjC)
  }

  private ensureCurve(doc: FinalizeDoc) {
    const gl = this.gl!
    const key = doc.curve.map((pt) => `${pt.x.toFixed(4)},${pt.y.toFixed(4)}`).join(';')
    if (this.curveTex && this.curveKey === key) return
    const lut = curveToLut(doc.curve, 256)
    if (!this.curveTex) this.curveTex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.curveTex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 1, 0, gl.RED, gl.UNSIGNED_BYTE, lut)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
    setTexParams(gl)
    this.curveKey = key
  }

  // ── Primitivas GL ──────────────────────────────────────────────────────────

  private use(name: string): ProgramInfo {
    const gl = this.gl!
    const p = this.programs.get(name)!
    gl.useProgram(p.prog)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    return p
  }

  private u(p: ProgramInfo, name: string): WebGLUniformLocation | null {
    if (!p.loc.has(name)) p.loc.set(name, this.gl!.getUniformLocation(p.prog, name))
    return p.loc.get(name)!
  }

  private bindTex(p: ProgramInfo, name: string, unit: number, tex: WebGLTexture) {
    const gl = this.gl!
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.uniform1i(this.u(p, name), unit)
  }

  private bindTarget(fbo: WebGLFramebuffer | null, w: number, h: number) {
    const gl = this.gl!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.viewport(0, 0, w, h)
  }

  private draw() {
    this.gl!.drawArrays(this.gl!.TRIANGLES, 0, 3)
  }

  private blurPass(src: WebGLTexture, dst: { fbo: WebGLFramebuffer; tex: WebGLTexture }, w: number, h: number, dx: number, dy: number) {
    const gl = this.gl!
    this.bindTarget(dst.fbo, w, h)
    const p = this.use('blur')
    this.bindTex(p, 'uTex', 0, src)
    gl.uniform2f(this.u(p, 'uDir'), dx, dy)
    this.draw()
  }

  dispose() {
    this.disposed = true
    const gl = this.gl
    if (!gl) return
    for (const f of [...this.fbos, ...this.smallFbos]) {
      gl.deleteFramebuffer(f.fbo)
      gl.deleteTexture(f.tex)
    }
    for (const p of this.programs.values()) gl.deleteProgram(p.prog)
    for (const e of this.images.values()) gl.deleteTexture(e.tex)
    for (const t of this.localTex) if (t) gl.deleteTexture(t)
    if (this.baseTex) gl.deleteTexture(this.baseTex)
    if (this.curveTex) gl.deleteTexture(this.curveTex)
    if (this.dummyTex) gl.deleteTexture(this.dummyTex)
    for (const entry of this.elemMaskTex.values()) gl.deleteTexture(entry.tex)
    this.elemMaskTex.clear()
    const ext = gl.getExtension('WEBGL_lose_context')
    ext?.loseContext()
    this.gl = null
  }
}

// ── helpers de módulo ─────────────────────────────────────────────────────────

const BLEND_INDEX: Record<string, number> = {
  normal: 0, multiply: 1, screen: 2, overlay: 3, 'soft-light': 4, lighten: 5, darken: 6,
}

function buildProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
  const vs = gl.createShader(gl.VERTEX_SHADER)!
  gl.shaderSource(vs, vsSrc)
  gl.compileShader(vs)
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    console.error('[finalizar.renderer] vertex shader:', gl.getShaderInfoLog(vs))
    return null
  }
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!
  gl.shaderSource(fs, fsSrc)
  gl.compileShader(fs)
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    console.error('[finalizar.renderer] fragment shader:', gl.getShaderInfoLog(fs))
    return null
  }
  const prog = gl.createProgram()!
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('[finalizar.renderer] link:', gl.getProgramInfoLog(prog))
    return null
  }
  return prog
}

function setTexParams(gl: WebGL2RenderingContext) {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
}

function uploadTexture(gl: WebGL2RenderingContext, tex: WebGLTexture, source: TexImageSource) {
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
  setTexParams(gl)
}

function makeFbo(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  float16 = false,
): { fbo: WebGLFramebuffer; tex: WebGLTexture } {
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  // float16: intermediários RGBA16F (precisa de EXT_color_buffer_float pra
  // renderizar; filtragem LINEAR de half-float é core no WebGL2). A 8 bits,
  // 6 passes encadeados quantizavam a cada etapa — banding em céu/gradiente.
  if (float16) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null)
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  }
  setTexParams(gl)
  const fbo = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return { fbo, tex }
}

/** hsv → rgb (h,s,v em 0..1) — para as rodas de grading no JS. */
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  switch (i % 6) {
    case 0: return [v, t, p]
    case 1: return [q, v, p]
    case 2: return [p, v, t]
    case 3: return [p, q, v]
    case 4: return [t, p, v]
    default: return [v, p, q]
  }
}
