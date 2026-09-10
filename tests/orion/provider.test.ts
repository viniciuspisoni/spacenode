// Orion · camada de fornecedor. TUDO MOCKADO — nenhum byte sai daqui.
// A chamada real vive só em tests/fidelity/bench.test.ts, atrás de
// FIDELITY_BENCH=1.
//
// O que estes testes travam:
//   - a rota direta funciona SEM FAL_KEY e sem tocar em fal.storage;
//   - o corpo multipart leva model/prompt/size/quality/n/output_format e as
//     imagens NA ORDEM, sem parâmetro de Gemini/Seedream/GPT Image 2;
//   - nada de fallback automático entre fornecedores nem corrida paralela;
//   - erro de auth/quota/parâmetro/moderação é marcado como não-repetível;
//   - dimensão entregue e uso de tokens são lidos de verdade (ou ficam null).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// vi.mock é içado pro topo do arquivo — as fábricas não podem fechar sobre
// variáveis de módulo comuns. vi.hoisted sobe junto.
const { fetchStorageBytes, falSubscribe, falStorageUpload, signStorageUrl } = vi.hoisted(() => ({
  fetchStorageBytes: vi.fn(),
  falSubscribe:      vi.fn(),
  falStorageUpload:  vi.fn(),
  signStorageUrl:    vi.fn(async (_admin: unknown, url: string) => url),
}))

vi.mock('@/lib/storage/fetch', () => ({
  fetchStorageBytes,
  assertSafeFetchUrl: () => {},
}))
vi.mock('@fal-ai/client', () => ({
  fal: {
    config: () => {},
    subscribe: falSubscribe,
    storage: { upload: falStorageUpload },
  },
}))
vi.mock('@/lib/storage/signed', () => ({
  signStorageUrl,
  PRIVATE_BUCKETS: new Set<string>(),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import {
  OrionError, OrionTimeoutError, ORION_FAL_ENDPOINTS,
  generateOrionImage, orionProvider, orionProviderReady,
} from '@/lib/orion/provider'
import { orionTargetSize } from '@/lib/orion/config'

/** PNG só com o cabeçalho: imageDims lê width/height dos offsets 16/20. */
function fakePng(width: number, height: number): Buffer {
  const buf = Buffer.alloc(64)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0)
  buf.writeUInt32BE(13, 8)
  buf.write('IHDR', 12, 'ascii')
  buf.writeUInt32BE(width, 16)
  buf.writeUInt32BE(height, 20)
  return buf
}

const SIZE = orionTargetSize(1920, 1080)   // 2048x1152

function baseArgs(over: Record<string, unknown> = {}) {
  return {
    variant: 'sunburst' as const,
    quality: 'high' as const,
    size: SIZE,
    prompt: 'PROMPT DE TESTE',
    imageUrls: ['https://x.supabase.co/storage/v1/object/public/space-mestres/a/1.png'],
    timeoutMs: 60_000,
    context: 'test',
    deliver: { kind: 'dataUrl' as const },
    ...over,
  }
}

function okResponse(body: Record<string, unknown>, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => (k === 'x-request-id' ? 'req_abc123' : null) },
    json: async () => body,
  }
}

const USAGE = {
  input_tokens: 1500,
  input_tokens_details: { text_tokens: 500, image_tokens: 1000 },
  output_tokens: 4000,
  total_tokens: 5500,
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  fetchStorageBytes.mockResolvedValue({ buffer: Buffer.from('src'), contentType: 'image/png' })
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  process.env.OPENAI_API_KEY = 'sk-test'
  delete process.env.ORION_IMAGE_PROVIDER
  delete process.env.FAL_KEY
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.OPENAI_API_KEY
  delete process.env.ORION_IMAGE_PROVIDER
  delete process.env.FAL_KEY
})

describe('escolha de fornecedor (env privada, nunca o cliente)', () => {
  it('default é openai', () => {
    expect(orionProvider()).toBe('openai')
  })
  it('só "fal" troca a rota; lixo cai no default', () => {
    process.env.ORION_IMAGE_PROVIDER = 'fal'
    expect(orionProvider()).toBe('fal')
    for (const v of ['FAL', 'gcp', 'ark', '', 'openai']) {
      process.env.ORION_IMAGE_PROVIDER = v
      expect(orionProvider(), v).toBe(v.toLowerCase() === 'fal' ? 'fal' : 'openai')
    }
  })
  it('prontidão olha a credencial do fornecedor ATIVO', () => {
    expect(orionProviderReady('openai')).toBe(true)
    expect(orionProviderReady('fal')).toBe(false)
    process.env.FAL_KEY = 'fal-test'
    expect(orionProviderReady('fal')).toBe(true)
    delete process.env.OPENAI_API_KEY
    expect(orionProviderReady('openai')).toBe(false)
  })
})

describe('rota direta OpenAI', () => {
  it('funciona SEM FAL_KEY e nunca toca em fal.storage/fal.subscribe', async () => {
    expect(process.env.FAL_KEY).toBeUndefined()
    fetchMock.mockResolvedValue(okResponse({
      data: [{ b64_json: fakePng(2048, 1152).toString('base64') }],
      usage: USAGE, size: '2048x1152', quality: 'high', output_format: 'png',
    }))

    const res = await generateOrionImage(baseArgs())

    expect(res.provider).toBe('openai')
    expect(res.providerModel).toBe('gpt-image-2.5-sunburst')
    expect(falStorageUpload).not.toHaveBeenCalled()
    expect(falSubscribe).not.toHaveBeenCalled()
    // Bytes vieram do armazenamento do SpaceNode, não de um upload intermediário.
    expect(fetchStorageBytes).toHaveBeenCalledTimes(1)
  })

  it('monta o multipart com os campos do schema e NADA de outro motor', async () => {
    fetchMock.mockResolvedValue(okResponse({
      data: [{ b64_json: fakePng(2048, 1152).toString('base64') }], usage: USAGE,
    }))
    await generateOrionImage(baseArgs())

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/images/edits')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer sk-test')

    const form = init.body as FormData
    expect(form.get('model')).toBe('gpt-image-2.5-sunburst')
    expect(form.get('prompt')).toBe('PROMPT DE TESTE')
    expect(form.get('size')).toBe('2048x1152')
    expect(form.get('quality')).toBe('high')
    expect(form.get('n')).toBe('1')
    expect(form.get('output_format')).toBe('png')
    expect(form.getAll('image[]')).toHaveLength(1)

    // Params de Gemini / Seedream / GPT Image 2 não entram.
    for (const alien of ['seed', 'thinking_level', 'resolution', 'image_size', 'aspect_ratio',
                         'num_images', 'image_urls', 'input_fidelity', 'moderation']) {
      expect(form.get(alien), alien).toBeNull()
    }
    // 'auto' nunca é o valor do piloto.
    expect(form.get('size')).not.toBe('auto')
    expect(form.get('quality')).not.toBe('auto')
  })

  it('preserva a ORDEM das referências (âncora primeiro)', async () => {
    fetchStorageBytes
      .mockResolvedValueOnce({ buffer: Buffer.from('ancora'), contentType: 'image/png' })
      .mockResolvedValueOnce({ buffer: Buffer.from('geometria'), contentType: 'image/jpeg' })
    fetchMock.mockResolvedValue(okResponse({
      data: [{ b64_json: fakePng(2048, 1152).toString('base64') }], usage: USAGE,
    }))

    await generateOrionImage(baseArgs({ imageUrls: ['https://a/anchor.png', 'https://b/geom.jpg'] }))

    expect(fetchStorageBytes.mock.calls.map(c => c[0])).toEqual(['https://a/anchor.png', 'https://b/geom.jpg'])
    const files = (fetchMock.mock.calls[0][1].body as FormData).getAll('image[]') as File[]
    expect(files.map(f => f.name)).toEqual(['ref-1.png', 'ref-2.jpg'])
  })

  it('registra a dimensão REALMENTE entregue quando diverge da pedida', async () => {
    fetchMock.mockResolvedValue(okResponse({
      data: [{ b64_json: fakePng(1536, 1024).toString('base64') }],
      usage: USAGE, size: '1536x1024',
    }))
    const res = await generateOrionImage(baseArgs())
    expect(res.requestedSize).toEqual({ width: 2048, height: 1152 })
    expect(res.deliveredSize).toEqual({ width: 1536, height: 1024 })
  })

  it('lê o uso de tokens do fornecedor', async () => {
    fetchMock.mockResolvedValue(okResponse({
      data: [{ b64_json: fakePng(2048, 1152).toString('base64') }], usage: USAGE,
    }))
    const res = await generateOrionImage(baseArgs())
    expect(res.usage.inputImageTokens).toBe(1000)
    expect(res.usage.outputTokens).toBe(4000)
    expect(res.usageRaw).toEqual(USAGE)
    expect(res.requestId).toBe('req_abc123')
  })

  it('sem OPENAI_API_KEY falha na hora, sem cair pra fal', async () => {
    delete process.env.OPENAI_API_KEY
    await expect(generateOrionImage(baseArgs())).rejects.toThrow(/OPENAI_API_KEY ausente/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(falSubscribe).not.toHaveBeenCalled()
  })
})

describe('erros — sem fallback, sem retry indevido', () => {
  const fatalCases: [number, string][] = [
    [401, 'invalid_api_key'],
    [429, 'insufficient_quota'],
    [400, 'invalid_request_error'],
    [400, 'moderation_blocked'],
  ]

  it.each(fatalCases)('HTTP %i / %s é marcado como não-repetível', async (status, code) => {
    fetchMock.mockResolvedValue(okResponse({ error: { code, message: 'nope' } }, status))
    const err = await generateOrionImage(baseArgs()).catch(e => e)
    expect(err).toBeInstanceOf(OrionError)
    expect(err.fatal).toBe(true)
    expect(err.status).toBe(status)
    // Uma chamada só: nada de tentar de novo nem trocar de fornecedor.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(falSubscribe).not.toHaveBeenCalled()
  })

  it('429 de rate limit puro NÃO é marcado como fatal', async () => {
    fetchMock.mockResolvedValue(okResponse({ error: { code: 'rate_limit_exceeded', message: 'slow down' } }, 429))
    const err = await generateOrionImage(baseArgs()).catch(e => e)
    expect(err.fatal).toBe(false)
  })

  it('a mensagem do erro não vaza prompt, chave nem URL do cliente', async () => {
    fetchMock.mockResolvedValue(okResponse({ error: { code: 'invalid_request_error', message: 'bad size' } }, 400))
    const err = await generateOrionImage(baseArgs()).catch(e => e)
    expect(err.message).not.toContain('PROMPT DE TESTE')
    expect(err.message).not.toContain('sk-test')
    expect(err.message).not.toContain('supabase.co')
  })

  it('200 sem imagem vira erro claro (não uma render vazia)', async () => {
    fetchMock.mockResolvedValue(okResponse({ data: [{}], usage: USAGE }))
    await expect(generateOrionImage(baseArgs())).rejects.toThrow(/não devolveu imagem/)
  })

  it('timeout carrega isFalTimeout (a rota já traduz essa flag)', async () => {
    fetchMock.mockImplementation((_u: string, init: { signal: AbortSignal }) =>
      new Promise((_res, rej) => {
        init.signal.addEventListener('abort', () => {
          const e = new Error('aborted'); e.name = 'AbortError'; rej(e)
        })
      }),
    )
    const err = await generateOrionImage(baseArgs({ timeoutMs: 15_000 })).catch(e => e)
    expect(err).toBeInstanceOf(OrionTimeoutError)
    expect(err.isFalTimeout).toBe(true)
  }, 30_000)
})

describe('rota fal.ai (comparação)', () => {
  beforeEach(() => {
    process.env.ORION_IMAGE_PROVIDER = 'fal'
    process.env.FAL_KEY = 'fal-test'
  })

  it('usa o endpoint da variante e as MESMAS instruções/dimensão da rota direta', async () => {
    falSubscribe.mockResolvedValue({
      data: { images: [{ url: 'https://v3.fal.media/out.png', width: 2048, height: 1152 }] },
      requestId: 'fal-req-1',
    })

    const res = await generateOrionImage(baseArgs({ variant: 'flare' }))

    expect(falSubscribe).toHaveBeenCalledTimes(1)
    const [endpoint, opts] = falSubscribe.mock.calls[0]
    expect(endpoint).toBe(ORION_FAL_ENDPOINTS.flare)
    expect(opts.input).toEqual({
      prompt: 'PROMPT DE TESTE',
      image_urls: ['https://x.supabase.co/storage/v1/object/public/space-mestres/a/1.png'],
      image_size: { width: 2048, height: 1152 },
      quality: 'high',
      num_images: 1,
      output_format: 'png',
    })
    expect(res.provider).toBe('fal')
    expect(res.deliveredSize).toEqual({ width: 2048, height: 1152 })
    // A fal não devolve tokens neste endpoint: null, NUNCA zero.
    expect(res.usage.outputTokens).toBeNull()
    expect(res.usageRaw).toBeNull()
    // E não chamou a OpenAI.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falha na fal NÃO cai pra OpenAI', async () => {
    falSubscribe.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }))
    await expect(generateOrionImage(baseArgs())).rejects.toBeInstanceOf(OrionError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
