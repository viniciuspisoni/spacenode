/** Client-safe paging/selection for the history picker. */
export interface PickerRender {
  id: string
  output_url: string | null
  ambient: string | null
  style: string | null
  lighting: string | null
  created_at: string
}

export interface PickedItem { id: string; imageUrl: string; label: string; context: string }

export function initialPickerRenders(items: PickedItem[]): PickerRender[] {
  return items.filter(item => item.imageUrl).map(item => ({ id: item.id, output_url: item.imageUrl,
    ambient: item.label, style: item.context, lighting: null, created_at: '' }))
}

export function mergePickerRenders(previous: PickerRender[], page: PickerRender[]): PickerRender[] {
  const byId = new Map(previous.map(item => [item.id, item]))
  for (const item of page) if (item.output_url) byId.set(item.id, item)
  return [...byId.values()]
}

export function pickerNextCursor(rawPage: PickerRender[], pageSize: number): string | null {
  // Paging uses the raw response, not the number of displayable images.
  return rawPage.length >= pageSize ? rawPage.at(-1)?.created_at || null : null
}

export function resolvePickerSelection(ids: string[], renders: PickerRender[], initial: PickedItem[]): PickedItem[] {
  const loaded = new Map(renders.map(item => [item.id, item]))
  const existing = new Map(initial.map(item => [item.id, item]))
  return [...new Set(ids)].flatMap(id => {
    const row = loaded.get(id)
    if (row?.output_url) return [{ id, imageUrl: row.output_url, label: row.ambient || row.style || 'Render',
      context: [row.style, row.lighting].filter(Boolean).join(' · ') }]
    const saved = existing.get(id)
    return saved?.imageUrl ? [saved] : []
  })
}
