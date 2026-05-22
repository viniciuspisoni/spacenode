'use client'

// Apresenta os presets de movimento de câmera agrupados por contexto
// (interior / fachada / comercial / social / genérico).
//
// Modo "Câmera arquitetônica" exibe todos os grupos lado a lado.
// Outros modos podem passar `archetypes` para filtrar.

import { useState } from 'react'
import {
  CAMERA_GROUPS,
  CAMERA_MOTIONS,
  type CameraMotion,
  type CameraMotionId,
} from '@/lib/video/cameraPresets'
import ArchitectureVideoPresetCard from './ArchitectureVideoPresetCard'

type GroupId = keyof typeof CAMERA_GROUPS

interface Props {
  selectedId:        CameraMotionId
  onSelect:          (id: CameraMotionId) => void
  recommendedId?:    CameraMotionId
  defaultGroup?:     GroupId
  showAllGroups?:    boolean
  compact?:          boolean
}

export default function CameraMotionPresets({
  selectedId,
  onSelect,
  recommendedId,
  defaultGroup = 'interior',
  showAllGroups,
  compact,
}: Props) {
  const [activeGroup, setActiveGroup] = useState<GroupId>(defaultGroup)

  if (showAllGroups) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {(Object.keys(CAMERA_GROUPS) as GroupId[]).map(gid => (
          <GroupSection
            key={gid}
            groupId={gid}
            selectedId={selectedId}
            recommendedId={recommendedId}
            onSelect={onSelect}
            compact={compact}
          />
        ))}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {(Object.keys(CAMERA_GROUPS) as GroupId[]).map(gid => (
          <button
            key={gid}
            type="button"
            onClick={() => setActiveGroup(gid)}
            style={{
              padding:       '5px 10px',
              borderRadius:  20,
              fontSize:      10.5,
              letterSpacing: '-0.005em',
              border:        `1px solid ${activeGroup === gid ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.07)'}`,
              background:    activeGroup === gid ? 'rgba(255,255,255,0.09)' : 'transparent',
              color:         activeGroup === gid ? '#ffffff' : 'rgba(255,255,255,0.50)',
              cursor:        'pointer',
              transition:    'all 0.15s',
            }}
          >
            {CAMERA_GROUPS[gid].label}
          </button>
        ))}
      </div>

      <PresetGrid
        motionIds={CAMERA_GROUPS[activeGroup].motionIds}
        selectedId={selectedId}
        recommendedId={recommendedId}
        onSelect={onSelect}
        compact={compact}
      />
    </div>
  )
}

function GroupSection({
  groupId, selectedId, recommendedId, onSelect, compact,
}: {
  groupId:       GroupId
  selectedId:    CameraMotionId
  recommendedId?: CameraMotionId
  onSelect:      (id: CameraMotionId) => void
  compact?:      boolean
}) {
  const group = CAMERA_GROUPS[groupId]
  return (
    <div>
      <div style={{
        fontSize:       10,
        fontWeight:     600,
        letterSpacing:  '0.1em',
        textTransform:  'uppercase' as const,
        color:          'rgba(255,255,255,0.40)',
        marginBottom:   8,
      }}>
        {group.label}
        <span style={{ marginLeft: 8, color: 'rgba(255,255,255,0.25)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
          {group.description}
        </span>
      </div>
      <PresetGrid
        motionIds={group.motionIds}
        selectedId={selectedId}
        recommendedId={recommendedId}
        onSelect={onSelect}
        compact={compact}
      />
    </div>
  )
}

function PresetGrid({
  motionIds, selectedId, recommendedId, onSelect, compact,
}: {
  motionIds:    CameraMotionId[]
  selectedId:   CameraMotionId
  recommendedId?: CameraMotionId
  onSelect:     (id: CameraMotionId) => void
  compact?:     boolean
}) {
  return (
    <div style={{
      display:             'grid',
      gridTemplateColumns: compact ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(160px, 1fr))',
      gap:                 8,
    }}>
      {motionIds.map(id => {
        const motion: CameraMotion = CAMERA_MOTIONS[id]
        if (!motion) return null
        const active = selectedId === id
        const recommended = recommendedId === id
        return (
          <div key={id} style={{ position: 'relative' }}>
            <ArchitectureVideoPresetCard
              motion={motion}
              active={active}
              onClick={() => onSelect(id)}
              compact={compact}
            />
            {recommended && !active && (
              <div style={{
                position: 'absolute', top: 6, right: 6,
                fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#86efac',
                background: 'rgba(20,30,25,0.85)',
                border: '1px solid rgba(134,239,172,0.25)',
                padding: '2px 6px', borderRadius: 20,
              }}>
                Sugerido
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
