'use client'

import { useState } from 'react'
import type { Space, Vista } from '@/lib/spaces/types'
import { GenBar }             from './GenBar'
import { VistasGallery }      from './VistasGallery'
import { EvolveDrawer }       from './EvolveDrawer'
import { LineagePanel }       from './LineagePanel'
import { UploadVistaDrawer }  from './UploadVistaDrawer'

// ── SpaceInteractive ──────────────────────────────────────────────────────────
// Client wrapper that owns the "which vista to evolve / inspect" state and
// renders GenBar + VistasGallery + EvolveDrawer + UploadVistaDrawer +
// LineagePanel as a single coordinated unit.
// The parent server component (SpacePage) stays pure server.

interface SpaceInteractiveProps {
  space:   Space
  anchor:  Vista | null
  vistas:  Vista[]
  spaceId: string
}

export function SpaceInteractive({
  space,
  anchor,
  vistas,
  spaceId,
}: SpaceInteractiveProps) {
  const [evolveParent,     setEvolveParent]     = useState<Vista | null>(null)
  const [lineageVista,     setLineageVista]      = useState<Vista | null>(null)
  const [uploadDrawerOpen, setUploadDrawerOpen]  = useState(false)

  function handleCardClick(vista: Vista) {
    setLineageVista(vista)
  }

  function handleEvolveFromLineage(vista: Vista) {
    // Close LineagePanel, open EvolveDrawer with the inspected vista as parent
    setLineageVista(null)
    setEvolveParent(vista)
  }

  return (
    <>
      <GenBar
        onEvolve={() => {
          if (anchor) setEvolveParent(anchor)
        }}
        onUploadVista={() => setUploadDrawerOpen(true)}
      />

      <VistasGallery
        vistas={vistas}
        spaceId={spaceId}
        anchor={anchor}
        onEvolve={setEvolveParent}
        onCardClick={handleCardClick}
      />

      {evolveParent && (
        <EvolveDrawer
          isOpen={true}
          onClose={() => setEvolveParent(null)}
          space={space}
          anchor={anchor}
          allVistas={vistas}
          initialParent={evolveParent}
          spaceId={spaceId}
        />
      )}

      {uploadDrawerOpen && (
        <UploadVistaDrawer
          isOpen={true}
          onClose={() => setUploadDrawerOpen(false)}
          space={space}
          anchor={anchor}
          allVistas={vistas}
          spaceId={spaceId}
        />
      )}

      {lineageVista && !evolveParent && !uploadDrawerOpen && (
        <LineagePanel
          vista={lineageVista}
          anchor={anchor}
          allVistas={vistas}
          onClose={() => setLineageVista(null)}
          onEvolve={handleEvolveFromLineage}
        />
      )}
    </>
  )
}
