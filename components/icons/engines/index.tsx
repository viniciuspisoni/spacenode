import type { ComponentProps } from 'react'
import { VegaIcon } from './VegaIcon'
import { PulsarIcon } from './PulsarIcon'
import { QuasarIcon } from './QuasarIcon'

export { VegaIcon } from './VegaIcon'
export { PulsarIcon } from './PulsarIcon'
export { QuasarIcon } from './QuasarIcon'

export type EngineSlug = 'vega' | 'pulsar' | 'quasar'

const ENGINE_ICONS = {
  vega: VegaIcon,
  pulsar: PulsarIcon,
  quasar: QuasarIcon,
} as const

type EngineIconProps = { engine: EngineSlug } & ComponentProps<typeof VegaIcon>

/**
 * Dynamic engine icon. Renders the correct logo based on the `engine` prop.
 * Use this when iterating over a list of engines (e.g. .map of EngineSlug[]).
 *
 * @example
 *   <EngineIcon engine="vega" className="w-5 h-5" />
 *   <EngineIcon engine={selectedEngine} display />
 */
export function EngineIcon({ engine, ...props }: EngineIconProps) {
  const Icon = ENGINE_ICONS[engine]
  return <Icon {...props} />
}
