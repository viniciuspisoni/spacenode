export interface ApiIntegration {
  id: string; name: string; category: string; purpose: string; evidence: string
  billing: string; state: 'implemented' | 'optional' | 'external'; configured: boolean | null
}

/** Presence in code or configuration does not imply production usage. */
export function apiInventory(): ApiIntegration[] {
  const has = (key: string) => Boolean(process.env[key]?.trim())
  return [
    { id: 'fal', name: 'fal.ai', category: 'IA', purpose: 'Imagens, fallback, Ampliar, vídeo, segmentação e 3D.', evidence: 'lib/ai/image-provider.ts; lib/upscale/providers; lib/video/adapters; lib/spaces/engines', billing: 'Por chamada, imagem, megapixel ou segundo, conforme o endpoint.', state: 'implemented', configured: has('FAL_KEY') },
    { id: 'ark', name: 'BytePlus · ModelArk', category: 'IA', purpose: 'Seedream 5.0 Pro: Quasar e Editar V4.', evidence: 'lib/ai/ark/seedreamEdit.ts; lib/ai/image-provider.ts', billing: 'Área de saída + referências adicionais.', state: 'implemented', configured: has('ARK_API_KEY') },
    { id: 'google_vertex', name: 'Google Cloud · Vertex', category: 'IA', purpose: 'Vega/Pulsar, visão, texto e adapter de vídeo.', evidence: 'lib/ai/image-provider.ts; lib/gemini.ts; lib/video/adapters', billing: 'Tokens, imagens e segundos; créditos da conta são separados do consumo.', state: 'implemented', configured: has('GOOGLE_VERTEX_PROJECT') && (has('GOOGLE_VERTEX_CREDENTIALS_JSON') || has('GOOGLE_APPLICATION_CREDENTIALS')) },
    { id: 'google_gemini', name: 'Gemini · API direta', category: 'IA', purpose: 'Visão, briefing, verificações, Nodi e edições legadas.', evidence: 'lib/gemini.ts; lib/nodi; lib/ai/google/editImage.ts', billing: 'Tokens de entrada, saída, pensamento e imagem.', state: 'implemented', configured: has('GEMINI_API_KEY') },
    { id: 'openai', name: 'OpenAI', category: 'IA', purpose: 'Orion, com opção de comparação via fal.ai.', evidence: 'lib/orion/provider.ts; lib/orion/pricing.ts', billing: 'Tokens e modalidade; uso incompleto fica sem valor.', state: 'implemented', configured: has('OPENAI_API_KEY') },
    { id: 'supabase', name: 'Supabase', category: 'Infraestrutura', purpose: 'Banco, Auth, Storage, URLs assinadas e Realtime.', evidence: 'lib/supabase; lib/storage', billing: 'Plano + banco, armazenamento, tráfego e excedentes.', state: 'implemented', configured: has('NEXT_PUBLIC_SUPABASE_URL') },
    { id: 'vercel', name: 'Vercel', category: 'Infraestrutura', purpose: 'Hospedagem, funções, deploys e tarefas agendadas.', evidence: 'vercel.json; app/api', billing: 'Plano + execução, transferência e excedentes.', state: 'implemented', configured: null },
    { id: 'stripe', name: 'Stripe', category: 'Pagamentos', purpose: 'Assinaturas, checkout, Pix e webhooks.', evidence: 'app/api/stripe; lib/stripe', billing: 'Taxas de pagamentos, Billing e eventuais estornos.', state: 'implemented', configured: has('STRIPE_SECRET_KEY') },
    { id: 'resend', name: 'Resend', category: 'Comunicação', purpose: 'Emails de convite de equipes.', evidence: 'lib/email/send-invite-email.ts', billing: 'Plano e volume de envio.', state: 'implemented', configured: has('RESEND_API_KEY') },
    { id: 'ycloud', name: 'YCloud · WhatsApp', category: 'Comunicação', purpose: 'Contato e recuperação de usuários; serviço externo informado pelo proprietário.', evidence: 'app/api/internal/whatsapp; conexão direta à YCloud não encontrada nesta revisão.', billing: 'Plano YCloud + tarifas de mensagens/templates da Meta.', state: 'external', configured: null },
    { id: 'meta', name: 'Meta · Marketing, Pixel e CAPI', category: 'Aquisição', purpose: 'Gestão de anúncios, atribuição e eventos de conversão.', evidence: 'lib/meta/ads.ts; lib/analytics/adapters/meta-conversions.ts; components/analytics/MetaPixel.tsx', billing: 'Investimento em anúncios é separado do custo das APIs do produto.', state: 'implemented', configured: has('META_ACCESS_TOKEN') || has('META_CAPI_ACCESS_TOKEN') || has('NEXT_PUBLIC_META_PIXEL_ID') },
    { id: 'ga4', name: 'Google Analytics 4', category: 'Aquisição', purpose: 'Eventos e análise de comportamento.', evidence: 'lib/analytics/adapters/ga4.ts', billing: 'Conferir edição e contrato; ausência de fatura não significa custo zero.', state: 'implemented', configured: has('NEXT_PUBLIC_GA4_ID') },
    { id: 'google_ads', name: 'Google Ads · Google Tag', category: 'Aquisição', purpose: 'Medição de conversões e campanhas Google, independente do GA4.', evidence: 'lib/gtag.ts; components/GoogleTag.tsx', billing: 'Investimento em anúncios separado do custo das APIs do produto.', state: 'implemented', configured: null },
    { id: 'google_oauth', name: 'Google OAuth', category: 'Autenticação', purpose: 'Login Google via Supabase Auth.', evidence: 'app/login; lib/supabase', billing: 'Auth contabilizado no Supabase; evitar duplicar a mesma despesa.', state: 'implemented', configured: null },
    { id: 'meshy', name: 'Meshy', category: 'IA', purpose: 'Adapter opcional para Blocos 3D; presença no código não confirma uso.', evidence: 'lib/blocos3d/meshy.ts; lib/blocos3d/provider.ts', billing: 'Plano e créditos da API.', state: 'optional', configured: has('MESHY_API_KEY') },
  ]
}
export const PROVIDER_NAMES: Record<string, string> = {
  fal: 'fal.ai', ark: 'BytePlus · ModelArk', google_vertex: 'Google Cloud · Vertex',
  google_gemini: 'Gemini · API direta', openai: 'OpenAI', unknown: 'Fornecedor não registrado',
}
export function normalizeProvider(value: unknown): string {
  if (value === 'gcp' || value === 'vertex') return 'google_vertex'
  if (value === 'google' || value === 'gemini' || value === 'direct') return 'google_gemini'
  return typeof value === 'string' && value.length > 0 ? value : 'unknown'
}
