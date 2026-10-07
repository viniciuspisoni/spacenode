import { describe, expect, it } from 'vitest'
import { initialPickerRenders, mergePickerRenders, pickerNextCursor, resolvePickerSelection,
  type PickedItem, type PickerRender } from '@/lib/history/render-picker'

const saved: PickedItem = { id: 'old-render', imageUrl: 'https://example.com/old.png', label: 'Quarto', context: 'Residencial' }
const row = (id: string, output: string | null = `https://example.com/${id}.png`): PickerRender => ({
  id, output_url: output, ambient: 'Sala', style: 'Residencial', lighting: 'Natural', created_at: '2026-10-01T10:00:00Z',
})

describe('history picker selection and paging', () => {
  it('keeps an existing selection visible and confirmable before its history page is loaded', () => {
    const renders = initialPickerRenders([saved])
    expect(renders[0].output_url).toBe(saved.imageUrl)
    expect(resolvePickerSelection([saved.id], renders, [saved])).toEqual([saved])
    expect(resolvePickerSelection([saved.id], [row('new-render')], [saved])).toEqual([saved])
  })
  it('preserves the selection order when mixing old selections and newly loaded renders', () => {
    const items = resolvePickerSelection(['new-render', saved.id], [row('new-render')], [saved])
    expect(items.map(item => item.id)).toEqual(['new-render', saved.id])
    expect(items[1]).toEqual(saved)
  })
  it('honors deselection and does not restore an old item the user removed', () => {
    expect(resolvePickerSelection([], initialPickerRenders([saved]), [saved])).toEqual([])
    expect(resolvePickerSelection(['new-render'], [row('new-render')], [saved])).toHaveLength(1)
  })
  it('refreshes a saved URL from a loaded page without duplicating its card or selection', () => {
    const current = row(saved.id, 'https://example.com/refreshed.png')
    const renders = mergePickerRenders(initialPickerRenders([saved]), [current, current])
    expect(renders).toHaveLength(1)
    const items = resolvePickerSelection([saved.id, saved.id], renders, [saved])
    expect(items).toHaveLength(1)
    expect(items[0].imageUrl).toBe(current.output_url)
  })
  it('continues paging through a full response containing incomplete images', () => {
    const page = [row('one'), { ...row('pending', null), created_at: '2026-09-01T10:00:00Z' }]
    expect(mergePickerRenders([], page)).toHaveLength(1)
    expect(pickerNextCursor(page, 2)).toBe('2026-09-01T10:00:00Z')
  })
  it('stops only on a short/empty response and ignores unresolvable selected IDs', () => {
    expect(pickerNextCursor([row('one')], 2)).toBeNull()
    expect(pickerNextCursor([], 2)).toBeNull()
    expect(resolvePickerSelection(['unknown', 'pending'], [row('pending', null)], [])).toEqual([])
  })
})
