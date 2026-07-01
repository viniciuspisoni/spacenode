// Skeleton da Biblioteca de Projetos — espelha o layout real (breadcrumb,
// header, métricas, controles e grid de cards) pra transição sem salto.

export default function SpacesLoading() {
  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)', padding: '40px 48px 80px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div className="spn-skeleton" style={{ width: 140, height: 14, marginBottom: 40 }} />

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          gap: 24, marginBottom: 22, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="spn-skeleton" style={{ width: 220, height: 28 }} />
            <div className="spn-skeleton" style={{ width: 420, height: 15, maxWidth: '70vw' }} />
          </div>
          <div className="spn-skeleton" style={{ width: 132, height: 40, borderRadius: 'var(--radius-md)' }} />
        </div>

        {/* Métricas */}
        <div style={{
          display: 'flex', gap: 16, paddingBottom: 20, marginBottom: 20,
          borderBottom: '0.5px solid var(--color-border)',
        }}>
          <div className="spn-skeleton" style={{ width: 80, height: 13 }} />
          <div className="spn-skeleton" style={{ width: 64, height: 13 }} />
          <div className="spn-skeleton" style={{ width: 120, height: 13 }} />
        </div>

        {/* Busca + ordenação */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', gap: 12,
          marginBottom: 14, flexWrap: 'wrap',
        }}>
          <div className="spn-skeleton" style={{ width: 320, height: 37, maxWidth: '60vw' }} />
          <div className="spn-skeleton" style={{ width: 130, height: 37 }} />
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
          {[52, 88, 78, 72, 92, 118, 84].map((w, i) => (
            <div key={i} className="spn-skeleton" style={{ width: w, height: 29, borderRadius: 'var(--radius-full)' }} />
          ))}
        </div>

        {/* Grid de cards */}
        <div style={{
          display: 'grid', gap: 16,
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              style={{
                background: 'var(--color-bg-elevated)',
                border: '0.5px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
              }}
            >
              <div className="spn-skeleton" style={{ aspectRatio: '4 / 3', borderRadius: 0 }} />
              <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="spn-skeleton" style={{ width: '65%', height: 15 }} />
                <div className="spn-skeleton" style={{ width: '42%', height: 12 }} />
                <div className="spn-skeleton" style={{ width: '55%', height: 11, marginTop: 4 }} />
              </div>
            </div>
          ))}
        </div>

      </div>
    </main>
  )
}
