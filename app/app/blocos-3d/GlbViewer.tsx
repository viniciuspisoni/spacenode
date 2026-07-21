'use client'

// Viewer 3D do Blocos 3D — three.js puro (sem react-three-fiber, dependência a
// menos). Carrega um GLB, enquadra a câmera no bounding box e dá órbita/zoom
// com auto-rotação até a primeira interação.
//
// Carregado via next/dynamic { ssr: false } pelo client do módulo — o three só
// entra no bundle desta página.

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

interface GlbViewerProps {
  /** URL (assinada) do .glb. Trocar a URL recarrega a cena. */
  url: string
}

export default function GlbViewer({ url }: GlbViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    setPhase('loading')
    let disposed = false
    let raf = 0

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1
    container.appendChild(renderer.domElement)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'

    const scene = new THREE.Scene()

    // Iluminação de estúdio neutra via IBL — PBR fica legível sem HDR externo.
    const pmrem = new THREE.PMREMGenerator(renderer)
    const roomEnv = new RoomEnvironment()
    const envTarget = pmrem.fromScene(roomEnv, 0.04)
    scene.environment = envTarget.texture

    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.autoRotate = true
    controls.autoRotateSpeed = 1.4
    // Primeira interação desliga a auto-rotação (o usuário assumiu a câmera).
    controls.addEventListener('start', () => { controls.autoRotate = false })

    const resize = () => {
      const w = container.clientWidth
      const h = container.clientHeight
      if (w === 0 || h === 0) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)

    const loader = new GLTFLoader()
    loader.load(
      url,
      (gltf) => {
        if (disposed) return
        const model = gltf.scene

        // Centraliza no origin e enquadra a câmera pela diagonal do bbox.
        const box = new THREE.Box3().setFromObject(model)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        model.position.sub(center)
        scene.add(model)

        const radius = Math.max(size.length() / 2, 0.001)
        const distance = radius / Math.tan((camera.fov * Math.PI) / 360)
        camera.position.set(distance * 0.85, distance * 0.55, distance * 0.85)
        camera.near = distance / 100
        camera.far = distance * 100
        camera.updateProjectionMatrix()
        controls.target.set(0, 0, 0)
        controls.minDistance = distance * 0.25
        controls.maxDistance = distance * 4
        controls.update()

        setPhase('ready')
      },
      undefined,
      (err) => {
        if (disposed) return
        console.error('[GlbViewer] load error:', err)
        setPhase('error')
      },
    )

    const tick = () => {
      raf = requestAnimationFrame(tick)
      controls.update()
      renderer.render(scene, camera)
    }
    tick()

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      observer.disconnect()
      controls.dispose()
      // O render target do fromScene não é liberado pelo pmrem.dispose() —
      // sem isto, cada troca de modelo vaza memória de GPU.
      envTarget.dispose()
      roomEnv.dispose()
      pmrem.dispose()
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
        for (const mat of materials) {
          for (const value of Object.values(mat)) {
            if (value instanceof THREE.Texture) value.dispose()
          }
          mat.dispose()
        }
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [url])

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0 }}>
      {phase === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '2px solid var(--color-border-strong)',
            borderTop: '2px solid var(--color-text-secondary)',
            animation: 'spin 0.9s linear infinite',
          }} />
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Carregando modelo 3D…</span>
        </div>
      )}
      {phase === 'error' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 11, color: 'var(--color-error)' }}>
            Não foi possível carregar o modelo. Baixe o arquivo pelos botões abaixo.
          </span>
        </div>
      )}
    </div>
  )
}
