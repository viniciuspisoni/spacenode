'use client'

import { useState } from 'react'
import { Sheet } from './glass'
import { ENGINES } from '@/lib/engines'
import { ONBOARDING_GOALS, type OnboardingGoal } from '@/lib/onboarding'
import { FIRST_IMAGE_MATERIAL_FIELDS, firstImageRecommendation, recommendedLighting, type FirstImageRecommendation as Recommendation } from '@/lib/onboarding/first-image'
import { PRESERVE, getLighting, type ProjectMaterials, type ProjectType } from '@/lib/prompts'
import styles from './FirstImage.module.css'

export default function FirstImageRecommendation({ projectType, goal, materials, materialRefs, current, initialRecommendation, onClose, onApply }: {
  projectType: ProjectType; goal: OnboardingGoal | null
  materials: ProjectMaterials; materialRefs: Partial<Record<keyof ProjectMaterials, string>>
  current: { scene: string; lighting: string; output: string; elements: number }
  initialRecommendation?: Recommendation
  onClose: () => void; onApply: (recommendation: Recommendation) => void
}) {
  const initialType = initialRecommendation?.config.projectType ?? projectType
  const initialIntention = initialRecommendation?.goal ?? goal ?? 'presentation'
  const [type, setType] = useState(initialType)
  const [intention, setIntention] = useState<OnboardingGoal>(initialIntention)
  const [light, setLight] = useState(initialRecommendation?.config.lighting ?? (initialIntention === 'lighting' ? recommendedLighting(initialType) : PRESERVE))
  const [field, setField] = useState<keyof ProjectMaterials>(() => initialRecommendation?.materialChange?.field ?? FIRST_IMAGE_MATERIAL_FIELDS[initialType].find(item => materials[item.id]?.trim() || materialRefs[item.id])?.id ?? FIRST_IMAGE_MATERIAL_FIELDS[initialType][0].id)
  const [descriptions, setDescriptions] = useState<ProjectMaterials>(() => initialRecommendation?.materialChange ? { ...materials, [initialRecommendation.materialChange.field]: initialRecommendation.materialChange.value } : { ...materials })
  const recommendation = firstImageRecommendation({ projectType: type, goal: intention, lighting: light, materialField: field, material: descriptions[field], hasMaterialReference: !!materialRefs[field] })
  const config = recommendation?.config
  const existingMaterials = Object.values(materials).some(Boolean) || Object.values(materialRefs).some(Boolean)
  return <Sheet open title="Preparar minha primeira imagem" onClose={onClose} doneLabel="Manter meus ajustes">
    <div className={styles.body}>
      <p>Confirme o tipo de projeto e a intenção. Você verá a configuração antes de aplicar.</p>
      <fieldset><legend>Sua imagem mostra</legend><div className={styles.actions}>
        {(['interior', 'exterior'] as const).map(item => <button type="button" className="spn-pill" key={item} aria-pressed={type === item} onClick={() => {
          setType(item); setLight(intention === 'lighting' ? recommendedLighting(item) : PRESERVE); setField(FIRST_IMAGE_MATERIAL_FIELDS[item][0].id)
        }}>{item === 'interior' ? 'Um interior' : 'Um exterior'}</button>)}
      </div></fieldset>
      <fieldset><legend>O que você quer fazer?</legend><div className={styles.actions}>
        {(Object.keys(ONBOARDING_GOALS) as OnboardingGoal[]).map(item => <button type="button" className="spn-pill" key={item} aria-pressed={intention === item} onClick={() => {
          if (item === 'lighting' && light === PRESERVE) setLight(recommendedLighting(type))
          setIntention(item)
        }}>{ONBOARDING_GOALS[item].label}</button>)}
      </div></fieldset>
      <label>Iluminação
        <select className="spn-input" value={light} onChange={e => setLight(e.target.value)}>{getLighting(type, PRESERVE).map(item => <option key={item}>{item}</option>)}</select>
      </label>
      {intention === 'materials' && <>
        <label>Superfície<select className="spn-input" value={field} onChange={e => setField(e.target.value as keyof ProjectMaterials)}>{FIRST_IMAGE_MATERIAL_FIELDS[type].map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>Material desejado<input className="spn-input" value={descriptions[field] ?? ''} maxLength={4000} placeholder="Ex.: porcelanato bege fosco" onChange={e => setDescriptions(prev => ({ ...prev, [field]: e.target.value }))} /></label>
        <p className={styles.caption}>{materialRefs[field] ? 'A amostra que você já enviou para esta superfície continua no pedido.' : 'Descreva o material para preparar. Depois de aplicar, você pode acrescentar uma amostra em Materiais.'}</p>
      </>}
      <section className={styles.summary} aria-label="Revisar configuração recomendada">
        <strong>O que será aplicado</strong>
        <dl>
          <div><dt>Cena</dt><dd>{type === 'interior' ? 'Interior' : 'Exterior'} · manter ambiente e entorno da referência</dd></div>
          <div><dt>Luz</dt><dd>{config?.lighting ?? (intention === 'lighting' ? light : PRESERVE)} · manter o estado das luminárias</dd></div>
          <div><dt>Materiais</dt><dd>{intention === 'materials' ? 'Alterar a superfície indicada; manter os demais ajustes de materiais' : existingMaterials ? 'Manter suas descrições e amostras já informadas' : 'Usar os materiais visíveis na referência'}</dd></div>
          <div><dt>Elementos</dt><dd>Sem solicitar elementos extras</dd></div>
          <div><dt>Saída</dt><dd>{config ? `${ENGINES[config.selectedEngine].name} · ${config.selectedResolution.toUpperCase()} · ${recommendation.nodeCost} Nodes por geração` : 'Escolha o material para completar a sugestão'}</dd></div>
        </dl>
        <details><summary>Comparar com meus ajustes atuais</summary><p>Cena: {current.scene}</p><p>Luz: {current.lighting}</p><p>Saída: {current.output}</p>{current.elements > 0 && <p>As {current.elements} solicitações de elementos extras serão removidas.</p>}</details>
      </section>
      {existingMaterials && <p className={styles.caption}>Se trocar Interior/Exterior, confira quais materiais aparecem nos controles. Suas descrições e amostras continuam salvas.</p>}
      <p>Aplicar prepara os controles. A geração só começa quando você clicar em “Gerar render”.</p>
      <button type="button" className="spn-cta" disabled={!recommendation} onClick={() => recommendation && onApply(recommendation)}>Aplicar configuração recomendada</button>
    </div>
  </Sheet>
}
