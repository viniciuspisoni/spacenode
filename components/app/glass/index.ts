/**
 * Kit de vidro do app — o material e as primitivas que o painel v1 do plugin
 * estabeleceu (`sketchup/spacenode/dialog.html`), agora disponíveis para as
 * telas de `/app`.
 *
 * O CSS mora em `app/globals.css` (seções "VIDRO NO APP" em diante). Estes
 * componentes são só a casca de comportamento — assim os dois fallbacks de
 * acessibilidade (`@supports not (backdrop-filter)` e
 * `prefers-reduced-transparency: reduce`) valem para tudo de uma vez, o que
 * NÃO acontecia com os ~30 `backdropFilter` inline espalhados pelo app.
 *
 * Regra de uso: quem monta vidro precisa de `<Ambient/>` atrás. O shell já
 * monta um em `app/app/layout.tsx`.
 */
export { Ambient, setAmbient, useAmbient } from './Ambient'
export { Sheet } from './Sheet'
export type { SheetProps } from './Sheet'
export { SettingGroup, SettingRow, summarize } from './SettingRow'
export type { SettingRowProps } from './SettingRow'
export { Segmented } from './Segmented'
export type { SegmentedItem, SegmentedProps } from './Segmented'
export { PillGroup, MultiPillGroup, ChoiceGroup } from './Choice'
export type { ChoiceOption } from './Choice'
export { RowIcon } from './icons'
