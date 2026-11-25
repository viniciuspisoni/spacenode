# Auditoria de segurança — 25/11/2026

Escopo: o que mudou desde a auditoria de 18/11 (`docs/audits/2026-11-18/seguranca.md`) — a integração Archicad/plugins (#342) e as rotas `/api/integrations/*` — mais dependências, rotas públicas, uploads, gates de admin, cron, rotas internas, Stripe, XSS, workflow do GitHub e o advisor de segurança do Supabase de produção (`nucyyqmurhnakhldshwr`, **somente leitura** — nenhum dado de usuário lido, nenhuma escrita).

Severidade: mesma escala da auditoria de 18/11.

## Achados

| ID | Sev. | Achado | Status |
| --- | --- | --- | --- |
| D1 | **Crítico** | `next@16.2.10` com ~25 avisos públicos (GHSA) corrigidos até `16.4.6`: RCE na otimização de imagem (AVIF/SVG) e no `next/og` (o app usa `next/og` em `app/opengraph-image.tsx`, `app/icon.tsx`, `app/apple-icon.tsx` e `next/image`), bypass do Proxy com Turbopack, envenenamento de cache entre usuários, SSRF. Parte depende do modo de hospedagem (na Vercel a otimização de imagem roda na infra da Vercel), mas não há motivo para ficar exposto. | Corrigido: `next` e `eslint-config-next` → `16.4.6` |
| D2 | Alto | `sharp@0.34.5` com CVEs herdadas de libvips, libheif e librsvg. O sharp decodifica imagens **enviadas pelos usuários** (`/api/uploads/confirm`, normalização, máscaras, fidelidade) — é exatamente a superfície que essas falhas atacam. | Corrigido: `sharp` → `0.35.5` (os tipos viraram exports nomeados; ajustado `lib/ai/fidelity/material-regions.ts`) |
| D3 | Alto | Dependências indiretas: `zod` (esgotamento de memória ao validar coleções grandes — usado pelo SDK `ai`), `nanoid`, `source-map-js`, `baseline-browser-mapping`. | Corrigido: `npm audit --omit=dev` → 0 vulnerabilidades |
| R1 | Médio | Cadastro por e-mail sem CAPTCHA concede 80 nodes (default de `profiles.credits`). Com e-mails descartáveis dá para criar contas em série e consumir IA paga (fal/Gemini) por conta da SpaceNode. A indicação **não** é explorável (só premia quando o indicado paga). | Recomendação abaixo |
| R2 | Médio | Bucket `space-mestres` continua **público**: fontes, máscaras e exports dos projetos dos clientes abrem para quem tiver a URL (nomes não são enumeráveis, mas URLs vazam por histórico, prints, logs de terceiros). Já mapeado como flip B2 em `20260703140000_storage_flip_buckets_private.sql`. | Pendente (B2) |
| R3 | Baixo | CSP sem `script-src` (já registrado em 18/11, item 6). | Pendente |
| R4 | Baixo | `lib/rate-limit.ts` é fail-open por desenho: se a RPC falhar, todos os limites somem em silêncio. | Recomendação abaixo |

## Verificação das correções

- `npm audit --omit=dev`: 0 vulnerabilidades (antes: 7 — 1 crítica, 5 altas, 1 moderada).
- `next build` de produção: ok (Next 16.4.6, 138 páginas).
- `tsc --noEmit`: ok.
- `vitest run`: 1464 testes passando, 5 pulados — idêntico à linha de base antes da atualização.
- Sharp 0.35.5 (libvips 8.18.7) processando PNG/JPEG/WebP, `rotate`, `resize`, `composite`, `metadata`: ok.

Depois do deploy, vale abrir em produção: login, Renderizar com upload, Editar, Ampliar, a página `/p/[slug]` e o preview de compartilhamento (imagem OG).

## Recomendações (não feitas nesta branch)

1. **CAPTCHA no cadastro (R1)** — ligar *Bot and Abuse Protection* no Supabase Auth com Cloudflare Turnstile (gratuito) e passar `captchaToken` no `signUp`/`signInWithPassword` de `app/login/page.tsx`. Exige criar as chaves no Cloudflare e configurar no painel do Supabase — por isso não entrou aqui. Complementos: bloquear domínios de e-mail descartável e, se o abuso aparecer, liberar os 80 nodes só após o primeiro login confirmado.
2. **Concluir o flip B2 (R2)** — seguir a ordem de rollout descrita no cabeçalho da migration `20260703140000`.
3. **Alerta para o rate limit (R4)** — além do `console.warn`, contar falhas do `bump_rate_limit` e alertar se passarem de um limiar; assim um problema de infra não desliga os limites sem ninguém saber.
4. **Não deixar as dependências envelhecerem** — este achado (D1–D3) surgiu só por tempo. Ativar o Dependabot (ou rodar `npm audit --omit=dev` no CI) para receber os avisos assim que saírem.

## Conferido e sem achado

Pareamento dos plugins (Archicad/SketchUp/Revit): código de 8 caracteres com `randomBytes`, TTL de 5 min, só hash no banco, segredo do dispositivo de 256 bits, refresh token em custódia e rotacionado, claim e aprovação atômicos, aprovação só por cookie, plataforma conferida, revogação; gates de staff de `/api/admin/*` (404 para não-staff); cron com segredo em tempo constante e fail-closed; `/api/internal/*` com comparação em tempo constante; uploads diretos (área, MIME, tamanho, prefixo do usuário, nome emitido pelo servidor, probe por bytes); `/api/media` (posse e path traversal); checkout Stripe (preço resolvido e conferido no servidor) e webhook assinado e idempotente; indicações; aceite de convite de workspace; endpoints públicos de tracking/waitlist com limite e teto de tamanho; login Google (nonce `__Host-`); sem `dangerouslySetInnerHTML` com dado de usuário; workflow do GitHub só com `contents: read` e sem segredos; nenhum segredo no código. Advisor de segurança do Supabase: apenas avisos INFO de tabelas com RLS e sem policy (o comportamento desejado para tabelas só do servidor); o aviso de senha vazada de 18/11 já não aparece.
