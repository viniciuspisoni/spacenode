export type FixtureLights = 'preserve' | 'on' | 'off'

export const FIXTURE_LIGHT_LABELS: Record<FixtureLights, string> = {
  preserve: 'Manter original', on: 'Acesas', off: 'Apagadas',
}

/** Older clients used a scene element to turn fixtures on. An explicit choice wins. */
export function resolveFixtureLights(value: unknown, sceneElements: readonly string[] = []): FixtureLights {
  if (value === 'preserve' || value === 'on' || value === 'off') return value
  return sceneElements.includes('Luzes Acesas') ? 'on' : 'preserve'
}

export function buildFixtureLightsBlock(value: FixtureLights): string {
  const state = value === 'on'
    ? 'Turn ON only the existing artificial light fixtures, with plausible emission and illumination.'
    : value === 'off'
      ? 'Turn OFF all artificial light fixtures: no bulb emission, LED glow, light pools or halos from fixtures. They may still reflect ambient light. Keep the scene visible using the requested natural/ambient atmosphere.'
      : 'Preserve the on/off state of EACH existing artificial light fixture exactly as shown in the reference. An unlit fixture stays unlit; do not switch lights on automatically at dusk or night.'
  return `ARTIFICIAL LIGHT STATE: ${state} This state takes priority over generic atmosphere, time-of-day and scene descriptions. Do not add, remove, move or redesign any fixture or LED strip. `
}
