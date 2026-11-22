import type { NextConfig } from "next";
import path from "path";

// ME-1 da auditoria 2026-07-03: headers de segurança base. CSP estrita NÃO
// entra ainda — a landing/app usa um <script> inline (theme flash-guard) que
// exigiria nonce/hash e poderia quebrar; frame-ancestors + nosniff + HSTS já
// fecham clickjacking e SSL-strip. SAMEORIGIN (não DENY) preserva qualquer
// preview/iframe same-origin. HSTS sem `preload` (compromisso irreversível).
//
// Auditoria 2026-11-18: CSP BASE, sem script-src/style-src (não toca no script
// inline nem em pixels/GIS/Stripe). Só fecha o que nenhuma página usa:
// <object>/<embed> (object-src) e sequestro de URLs relativas via <base>
// (base-uri). frame-ancestors espelha o X-Frame-Options para browsers que
// priorizam a CSP. A CSP com nonce continua como próximo passo (exige render
// dinâmico — ver node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
const BASE_CSP = "object-src 'none'; base-uri 'self'; frame-ancestors 'self'"

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy',   value: BASE_CSP },
  { key: 'X-Frame-Options',           value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig: NextConfig = {
  // Permite um dev server paralelo (ex.: preview de outra sessão) sem colidir
  // com o lock por distDir do Next 16. Builds de produção ignoram (default .next).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  outputFileTracingIncludes: {
    '/review-assets/*': ['./marketing/landing-review/*.webp'],
    '/previa/imagens-recentes/dados': ['./marketing/landing-review/curadoria-20261122/imagens.bin'],
  },
  experimental: {
    // Com proxy.ts presente, o Next bufferiza o body e TRUNCA em 10MB por
    // default — multipart acima disso chega corrompido na rota e formData()
    // lança "Failed to parse body as FormData" (diagnóstico 2026-07-06 no
    // /api/video). 25mb cobre o teto de upload dos módulos (20MB) + overhead.
    proxyClientMaxBodySize: '25mb',
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
};

export default nextConfig;
