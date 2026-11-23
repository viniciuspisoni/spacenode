// Plugins que pareiam com a SpaceNode pelo fluxo de código (RFC 8628).
//
// CLIENT-SAFE: a página /integrations/pair usa os rótulos.

export const INTEGRATION_PLATFORMS = ['sketchup', 'archicad', 'revit'] as const

export type IntegrationPlatform = (typeof INTEGRATION_PLATFORMS)[number]

export const PLATFORM_LABELS: Record<IntegrationPlatform, string> = {
  sketchup: 'SketchUp',
  archicad: 'Archicad',
  revit: 'Revit',
}

export function parsePlatform(raw: unknown): IntegrationPlatform | null {
  return typeof raw === 'string' && (INTEGRATION_PLATFORMS as readonly string[]).includes(raw)
    ? (raw as IntegrationPlatform)
    : null
}
