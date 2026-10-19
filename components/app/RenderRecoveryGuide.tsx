'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/analytics/client'
import { LIGHT_RECOVERY_OPTIONS, RECOVERY_VERSION, lightRecoveryInstruction, materialRecoveryInstruction, type RenderRecovery } from '@/lib/onboarding/render-recovery'
import styles from './RenderRecovery.module.css'

export default function RenderRecoveryGuide({ recovery, hasSelection = false, hasReference = false, busy = false, onPrepare, onPickReference }: {
  recovery: RenderRecovery
  hasSelection?: boolean
  hasReference?: boolean
  busy?: boolean
  onPrepare?: (action: 'swap_material' | 'refine_area', instruction: string) => void
  onPickReference?: () => void
}) {
  const [target, setTarget] = useState('')
  const [material, setMaterial] = useState('')
  const [prepared, setPrepared] = useState(false)
  const viewed = useRef(false)
  useEffect(() => {
    if (viewed.current) return
    viewed.current = true
    track('cta_clicked', { cta: 'onboarding_recovery_viewed', render_id: recovery.renderId, reason: recovery.reason, flow_version: RECOVERY_VERSION })
  }, [recovery.renderId, recovery.reason])
  const prepare = (action: 'swap_material' | 'refine_area', instruction: string) => {
    onPrepare?.(action, instruction)
    setPrepared(true)
    track('cta_clicked', { cta: 'onboarding_recovery_prepared', render_id: recovery.renderId, reason: recovery.reason, action, flow_version: RECOVERY_VERSION })
  }
  const materialInstruction = materialRecoveryInstruction(target, material, hasSelection, hasReference)

  if (recovery.reason === 'geometry') return <section className={`spn-glass ${styles.geometry}`} aria-label="Revisar geometria">
    <span className={styles.eyebrow}>Vamos conferir seu projeto</span>
    <h1>O que mudou entre a referência e o render?</h1>
    <p>Confira enquadramento, proporções e aberturas. Se algo saiu diferente do projeto, revise a referência e a configuração antes de gerar novamente.</p>
    <div className={styles.comparison}>
      {recovery.inputUrl && <figure><figcaption>Referência enviada</figcaption>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={recovery.inputUrl} alt="Referência original do projeto" />
      </figure>}
      <figure><figcaption>Render gerado</figcaption>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={recovery.outputUrl} alt="Render para conferir com a referência" />
      </figure>
    </div>
    <fieldset className={styles.checklist}><legend>O que precisa de atenção? Use para conferir.</legend>
      {['Enquadramento da vista', 'Proporções dos volumes', 'Portas, janelas e outras aberturas'].map(label => <label key={label}><input type="checkbox" />{label}</label>)}
    </fieldset>
    <Link className="spn-cta" style={{ width: 'fit-content' }} href={`/app/generate?${new URLSearchParams({ reuse: recovery.renderId, ...(recovery.inputUrl ? { source: recovery.inputUrl } : {}) })}#guia`}>Rever referência no Renderizar →</Link>
    <p className={styles.note}>Abrir a revisão não consome Nodes. Confira a imagem e o custo antes de uma nova geração.</p>
  </section>

  return <section className={styles.guide} aria-label="Ajuste guiado">
    <span className={styles.eyebrow}>Um passo para o resultado servir</span>
    <h2>{recovery.reason === 'lighting' ? 'Vamos ajustar a luz' : recovery.reason === 'materials' ? 'Vamos acertar o material' : 'Vamos ajustar um detalhe'}</h2>
    {recovery.reason === 'lighting' ? <>
      <p>Escolha uma intenção. A sugestão vai para o pedido, onde você pode revisar cada detalhe.</p>
      <div className={styles.actions}>{LIGHT_RECOVERY_OPTIONS.map(item => <button type="button" className="spn-pill" key={item.id} disabled={busy} onClick={() => prepare('refine_area', lightRecoveryInstruction(item.id))}>{item.label}</button>)}</div>
    </> : recovery.reason === 'materials' ? <>
      <p>Indique a superfície ou marque a área na imagem. Depois, descreva o acabamento ou envie uma amostra.</p>
      <label>Onde mudar?<input className="spn-input" value={target} maxLength={180} placeholder="Ex.: piso da sala" disabled={busy} onChange={e => { setTarget(e.target.value); setPrepared(false) }} /></label>
      <label>Qual material?<input className="spn-input" value={material} maxLength={240} placeholder="Ex.: porcelanato bege fosco" disabled={busy} onChange={e => { setMaterial(e.target.value); setPrepared(false) }} /></label>
      <div className={styles.actions}>
        {onPickReference && <button type="button" className="spn-pill" disabled={busy} onClick={onPickReference}>{hasReference ? 'Trocar amostra' : 'Enviar amostra'}</button>}
        <button type="button" className="spn-pill" disabled={busy || !materialInstruction} onClick={() => materialInstruction && prepare('swap_material', materialInstruction)}>Preparar pedido</button>
      </div>
      {hasReference && <p role="status">Amostra pronta. Confira a referência no pedido.</p>}
    </> : <p>Descreva uma mudança específica no pedido abaixo. Se o ajuste for local, marque a área na imagem para indicar onde mudar.</p>}
    {prepared && <p role="status">Sugestão preparada. Revise o pedido e o custo antes de confirmar.</p>}
    <p className={styles.note}>Preparar o pedido não gera uma edição nem consome Nodes.</p>
  </section>
}
