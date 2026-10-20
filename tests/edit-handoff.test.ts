import { describe, expect, it } from 'vitest'
import { EDIT_HANDOFF_MAX_AGE, EDIT_HANDOFF_MAX_BYTES, editHandoffIntention, parseEditHandoff, readEditHandoff, saveEditHandoff, type EditHandoff } from '@/lib/onboarding/edit-handoff'

const owner = '00000000-0000-4000-8000-000000000001'
const id = '00000000-0000-4000-8000-000000000002'
const now = Date.now()
const file = new File(['original-image'], 'fachada.png', { type: 'image/png' })
const handoff: EditHandoff = { version: 1, id, ownerId: owner, createdAt: now, image: file, filename: file.name, intention: 'Suavizar a luz e preservar os materiais.' }

describe('private first-image to Editar handoff', () => {
  it('keeps the actual original and intention, scoped to owner and opaque ID', () => {
    expect(parseEditHandoff(handoff, owner, id, now)).toBe(handoff)
    expect(parseEditHandoff(handoff, owner, id, now)?.image).toBe(file)
    expect(parseEditHandoff(handoff, id, id, now)).toBeNull()
    expect(parseEditHandoff(handoff, owner, owner, now)).toBeNull()
  })
  it('expires after 30 minutes and rejects future or invalid versions', () => {
    expect(parseEditHandoff(handoff, owner, id, now + EDIT_HANDOFF_MAX_AGE + 1)).toBeNull()
    expect(parseEditHandoff({ ...handoff, createdAt: now + 60_001 }, owner, id, now)).toBeNull()
    expect(parseEditHandoff({ ...handoff, version: 2 }, owner, id, now)).toBeNull()
  })
  it.each([new Blob([]), new Blob(['x'], { type: 'image/svg+xml' }), new Blob([new Uint8Array(EDIT_HANDOFF_MAX_BYTES + 1)], { type: 'image/png' })])('refuses an invalid image before upload', image => {
    expect(parseEditHandoff({ ...handoff, image }, owner, id, now)).toBeNull()
  })
  it('carries the user follow-ups and unsent draft, excluding assistant claims', () => {
    expect(editHandoffIntention([{ role: 'user', text: '  Trocar o piso. ' }, { role: 'assistant', text: 'Já alterei tudo.' }, { role: 'user', text: 'Por porcelanato claro.' }], '  Manter o sofá. '))
      .toBe('Trocar o piso.\n\nPor porcelanato claro.\n\nManter o sofá.')
    expect(editHandoffIntention([], '')).toBe('')
    expect(() => editHandoffIntention([{ role: 'user', text: 'x'.repeat(5000) }], 'final')).toThrow('resumo')
    expect(editHandoffIntention([], 'final')).toBe('final')
  })
  it('does not fall back to a public URL when browser storage is unavailable', async () => {
    await expect(saveEditHandoff(owner, file, handoff.intention)).rejects.toThrow('neste navegador')
    expect(await readEditHandoff(owner, 'arbitrary-url')).toBeNull()
  })
})
