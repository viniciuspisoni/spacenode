'use client'

import { useState } from 'react'
import RenderQualityReview from '@/components/generate/RenderQualityReview'
import RenderComparisonImages from '@/components/generate/RenderComparisonImages'

/** Browser fixture using the production components and existing public assets.
 * No auth, database, feedback writes or paid generation. Not an application route. */
export default function QualityReviewFixture() {
  const [version, setVersion] = useState(0)
  const [warning, setWarning] = useState(false)
  const [position, setPosition] = useState(50)
  const [compared, setCompared] = useState(false)
  const scene = version % 2 === 0 ? 'sala-estar' : 'cozinha-ceramica'
  return <main style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 24px', color: 'var(--color-text-primary)' }}>
    <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 12 }}>SpaceNode 2.0 · prévia local de implementação</p>
    <h1 style={{ fontSize: 30, fontWeight: 500, marginBottom: 12 }}>Do resultado à apresentação</h1>
    <p style={{ maxWidth: 700, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
      Imagens públicas existentes usadas para conferir a interface. Nenhuma imagem foi gerada nesta prévia.
    </p>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 22 }}>
      <section aria-label="Comparação de imagens">
        <div style={{ position: 'relative', aspectRatio: '1.6', overflow: 'hidden', borderRadius: 16, background: 'var(--color-surface)' }}>
          <RenderComparisonImages before={`/proj-${scene}-base.jpg`} after={`/proj-${scene}-render.jpg`} sliderPos={position}
            pan={{ x: 0, y: 0 }} scale={1} imageStyle={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, fontSize: 12 }}>
          Antes <input aria-label="Comparação antes e depois" type="range" min={0} max={100} value={position}
            onChange={event => setPosition(Number(event.target.value))} style={{ flex: 1 }} /> Depois
        </label>
      </section>
      <RenderQualityReview key={version} warning={warning} editHref="#editar" finishHref="#finalizar"
        onCompare={() => { setPosition(50); setCompared(true) }} />
    </div>
    {compared && <p role="status" style={{ marginTop: 16, fontSize: 12 }}>Comparação centralizada.</p>}
    <aside style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, marginTop: 24, fontSize: 12 }} aria-label="Controles da prévia">
      <button type="button" className="spn-ghost" onClick={() => { setVersion(v => v + 1); setCompared(false) }}>Trocar resultado da prévia</button>
      <label><input type="checkbox" checked={warning} onChange={event => setWarning(event.target.checked)} /> Simular alerta de preservação</label>
    </aside>
  </main>
}
