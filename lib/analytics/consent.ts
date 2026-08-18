// lib/analytics/consent.ts
//
// Ponto único de decisão sobre scripts/envios de MARKETING de terceiros
// (GA4, Meta Pixel, Meta CAPI). O rastreamento first-party (cookies sn_* +
// marketing.acquisition_events) NÃO passa por aqui — é infraestrutura própria,
// sem terceiros, já coberta pela cláusula 7 da política de privacidade.
//
// MECANISMO ATUAL: o projeto não tem banner de consentimento; a política
// (cláusula 7) promete que nenhum rastreador de terceiros entra sem a política
// ser atualizada antes — e o Google tag (components/GoogleTag.tsx) já segue a
// regra "só em produção". Este módulo espelha exatamente esse mecanismo:
//   habilitado = produção + env var do adapter presente.
//
// QUANDO EXISTIR BANNER/CMP: trocar a implementação AQUI (uma função no client,
// uma no server) e todos os adapters passam a respeitá-lo automaticamente.
// Antes de definir as envs dos adapters em produção, atualizar a cláusula 7 —
// mesma pendência LGPD que hoje bloqueia a campanha de Search (o gtag do
// Google Ads está em produção e a cláusula ainda promete "sem rastreadores").

/** Client: pode carregar/enviar para scripts de marketing de terceiros? */
export function marketingConsentClient(): boolean {
  return process.env.NODE_ENV === 'production'
}

/** Server: pode enviar eventos a APIs de marketing de terceiros (CAPI/GA4 MP)? */
export function marketingConsentServer(): boolean {
  return process.env.NODE_ENV === 'production'
}
