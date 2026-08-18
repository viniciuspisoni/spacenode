// tests/history/generation-detail.test.ts
//
// Contrato do inferProvider (lib/history/generation-detail): o Diagnóstico
// técnico NUNCA pode chutar 'fal' quando o generation_log não existe — no
// incidente de 2026-08-13→18 uma migration pendente derrubou o insert do log e
// o default `?? 'fal'` fez renders gerados no GCP aparecerem como "fal",
// disparando um alarme falso de "caiu tudo no fallback". A inferência usa só
// evidência real da row: formato do request id e host da URL de saída.

import { describe, it, expect } from 'vitest'
import { inferProvider } from '@/lib/history/generation-detail'

// Formatos reais: request id da fila da FAL é UUID; responseId do Vertex é uma
// string base64-like sem hifens (ex.: colhido de prod em 2026-08-18).
const FAL_UUID  = '4c3f2a1e-9b8d-4e6f-a1b2-3c4d5e6f7a8b'
const VERTEX_ID = 'z2iEar3oF96Jl7oPy7HwoAI'

describe('inferProvider', () => {
  it('request id UUID da FAL → fal (com ou sem URL re-hospedada)', () => {
    expect(inferProvider(FAL_UUID)).toBe('fal')
    expect(inferProvider(FAL_UUID, 'https://xyz.supabase.co/storage/v1/object/public/space-mestres/a.png')).toBe('fal')
  })

  it('responseId do Vertex → gcp', () => {
    expect(inferProvider(VERTEX_ID)).toBe('gcp')
    expect(inferProvider(VERTEX_ID, 'https://xyz.supabase.co/storage/v1/object/public/space-mestres/a.png')).toBe('gcp')
  })

  it('URL na CDN da FAL → fal mesmo sem request id', () => {
    expect(inferProvider(null, 'https://v3.fal.media/files/abc/output.png')).toBe('fal')
  })

  it('sem evidência → null (a UI exibe "Não registrado", nunca chuta provider)', () => {
    expect(inferProvider(null)).toBeNull()
    expect(inferProvider(null, 'https://xyz.supabase.co/storage/v1/object/public/space-mestres/a.png')).toBeNull()
  })
})
