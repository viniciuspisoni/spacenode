# AUDITORIA PROFUNDA — SPACENODE (2026-06-09)

> Metodologia: 9 auditores especializados rodaram em paralelo sobre o repositório (somente leitura), cada um cobrindo um domínio (arquitetura, custos, Editar, Renderizar, UX, billing, Supabase/RLS, segurança, observabilidade), com verificação adversarial dos achados P0/P1 por agentes céticos independentes. 55 agentes, ~863 leituras de código. **Limitação transparente:** o limite de gasto mensal da conta foi atingido durante a execução — o auditor de arquitetura e ~37 verificações adversariais falharam. 10 achados receberam verificação adversarial completa (todos confirmados); os 5 P0 restantes foram verificados manualmente linha a linha na sessão principal (todos confirmados, com nuances anotadas). A seção 1 (arquitetura) foi reconstruída a partir dos mapas dos 8 auditores + inspeção direta. Relatórios brutos por área em `.claude/audit-parts/`.
>
> Nenhuma mudança foi feita: sem migrations, sem deploy, sem alteração de env/billing. Apenas leitura e este relatório.

---

## 1. MAPA GERAL DA ARQUITETURA

### Organização

```
app/
  page.tsx + components/landing/*      Landing pública (mobile-first, Navbar/Hero/Pricing/FAQ/MobileCTA)
  login/, auth/, forgot-password/      Auth Supabase
  p/[slug]/                            Pack compartilhado público (share_token 96 bits, expira 90d)
  app/                                 App autenticado (gateado por proxy.ts)
    generate/   → Renderizar (GenerateClient.tsx, 1278 linhas)
    editar/     → Editar standalone (RetocarStandaloneFlow.tsx, 1801 linhas)
    spaces/     → Spaces (DNA, vistas, packs)
    upscale/    → Ampliar
    video/      → Animar
    apresentar/ → Moodboard, prancha, isométrica, planta humanizada
    history/, billing/, conta/, equipe/, settings/
  api/ (51 rotas)                      Toda a lógica server-side
components/ (57 arquivos)              app/, landing/, spaces/
lib/
  engines.ts, prompts.ts, fidelity-engine.ts, gemini.ts    Renderizar + LLM
  spaces/ (edit-router, edit-pipeline, edit-crop, dna, economy, engines/*)
  upscale/ (orchestrator, providers topaz/clarity/nafnet/photo-restoration)
  video/ (models, adapters/falAdapter)
  apresentar/, workspaces/, email/, supabase/ (client/server/admin)
supabase/migrations/ (23)  +  supabase-schema.sql (legado)
proxy.ts                               Gate de auth: só /app e /login. NÃO cobre /api.
vercel.json                            Só redirect www. Sem functions/crons.
```

### Fluxo principal de geração (Renderizar)
1. Client comprime para 2048px JPEG q0.92 (`GenerateClient.tsx:113-137`) e envia base64 a `POST /api/generate`.
2. Rota valida engine/resolução (`lib/engines.ts`: Vega=nano-banana-pro/edit, Pulsar=nano-banana-2/edit, Quasar=gpt-image-2/edit), **debita antes** via RPC `consume_workspace_nodes` (resolve dono do workspace → `consume_nodes_v2`: plano primeiro, Lumens FIFO, `FOR UPDATE`).
3. Upload a `fal.storage`, prompt via `buildFidelityPrompt` (`lib/prompts.ts:789-896`), `fal.subscribe` com `Promise.race` 90s. É image-to-image **por instrução de edição** — não há strength/denoise/ControlNet; toda fidelidade é prompt.
4. Sucesso → INSERT em `renders` (com `config_snapshot`); a URL gravada é **do CDN da FAL** (sem re-hospedagem). Falha → refund best-effort.

### Fluxo de créditos/nodes
- **Criação:** signup grant (`profiles.credits DEFAULT 40`), compra de plano (Stripe checkout → webhook `checkout.session.completed` faz `SET credits`), renovação (`invoice.paid` + `billing_reason='subscription_cycle'`), Lumens avulsos (`add_lumen_pack`, idempotente por session_id, 90 dias).
- **Consumo:** todas as rotas → `consume_workspace_nodes` (bolsa do dono, Fase 1.5) → `consume_nodes_v2`. Exceção: **/api/video debita DEPOIS de gerar, sem checar erro**.
- **Reembolso:** `refund_workspace_nodes` best-effort no catch (mas o `{error}` do supabase-js nunca é checado — ver §6).
- **Não existe ledger** — o saldo é um contador mutável.

### Integrações
FAL (`@fal-ai/client`, ~20 call sites `fal.subscribe`, tudo síncrono, zero `fal.queue`), Gemini direto (`lib/gemini.ts`, gemini-2.5-flash, retry 3x), Stripe (checkout + webhook com assinatura verificada), Supabase (Auth/DB/Storage; 2 buckets **públicos**: space-mestres 15MB, architect-identity 2MB), e-mail de convite (`lib/email/`).

### Débito arquitetural relevante
- **Sistema legado morto do Editar**: `engines/router.ts`, `orchestrate.ts`, `guard-policy.ts`, `object-removal.ts`, `flux-inpaint.ts`, `EDIT_COST` em `edit-economy.ts` — zero callers, mas exportados (risco de reativação errada).
- **Prompt builders mortos**: `buildGenerationPrompt`/`buildFidelityBlock`/`ENV_EN` (~140 descrições) sem callers; parâmetros `geometryLock`/`fidelityMode` trafegam e persistem sem efeito.
- **Drift repo×produção**: tabelas `edits`, `walkthroughs`, `shots` não têm DDL em nenhum SQL do repo, mas são alteradas por migrations 20260608* e usadas por rotas; `profiles.project_materials` só existe em `migration-materials.sql` solto na raiz; `renders.config_snapshot` sem DDL; duas migrations com timestamp `20260508000000`; `20260519000000` untracked. **Um ambiente novo não sobe a partir do repo.**
- Lixo na raiz: `test-*.js`, `fix-*.sh`, `sidebar-demo.html`, logs de vercel-login (não versionados, mas poluem).
- Nomenclatura tripla: credits/nodes/Lumens; Editar/Retocar; Ampliar/Upscale.

---

## 2. AUDITORIA DE CUSTOS DE API

### Inventário por operação

| Operação | Endpoint/modelo | Nodes | Custo USD no código | Margem no piso (node=US$0,0135) |
|---|---|---|---|---|
| Renderizar Vega | fal-ai/nano-banana-pro/edit | 20 (2K) / 40 (4K) | **não documentado** | não-verificável — conferir doc FAL |
| Renderizar Pulsar | fal-ai/nano-banana-2/edit | 10/15/25 | **não documentado** | idem |
| Renderizar Quasar | openai/gpt-image-2/edit | 28/56 | **não documentado** | idem |
| Spaces DNA | Gemini flash ×2 | 8 | centavos | altíssima |
| Spaces gerar vista | mesmos engines do Renderizar | 10–56/vista | **não documentado** | idem |
| Editar quickFix | kontext-lora/inpaint | 1 | US$0,035/MP (crop até 3MP ⇒ até US$0,105) | **negativa** |
| Editar localized | inpaint/fill/nano-banana | 2 | US$0,035–0,105 | **negativa** |
| Editar medium | idem | 3 | US$0,039–0,040 | ~0% |
| Editar global | flux-pro/kontext | 4 | US$0,040 | ~26% (regra do projeto: ≥50%) |
| Editar premium | gemini-3-pro-image-preview/edit | 5–6 | US$0,150 | **−85% a −122%** |
| Editar freeFix | qualquer | 0 | US$0,035–0,105 | −100% (por design, com teto/plano) |
| Upscale vista | clarity-upscaler | 8/16 | **não documentado** | conferir |
| Upscale módulo | topaz/clarity/nafnet/photo-rest. | 3–50+ | **não documentado** | conferir |
| Animar Kling | US$0,07/s | 60/120 | documentado | ~57% ✔ |
| Animar Veo | US$0,20/s | 140/210/280 | documentado | ~58% ✔ |
| Animar Seedance | US$0,682/s | oculto (isAvailable=false) | documentado | negativa — corretamente escondido |
| Moodboard/prancha/isométrica | Gemini + vega 2K | 8/6/20 | parcial | ok |
| analyze, video/analyze, segment (SAM2), verify-dna, preview | Gemini/SAM2 | **0** | não doc. | custo sem receita, **sem rate limit** |

**Valor do node:** piso R$0,0729 (Office anual, `lib/plans.ts:62-71`), FX R$5,40 ⇒ US$0,0135. Melhor caso: Lumen 500 a R$0,178 (US$0,033).

### Achados principais de custo
1. **[P0] Editar precifica abaixo do custo** (`edit-router.ts:126-163`, verificado manualmente). Premium 5 nodes = US$0,0675 de receita vs US$0,15 de custo. Tiers 1–3 negativos/zerados no piso. Contradiz a regra de margem ≥50% que o próprio comentário (`:146`) e o vídeo (`lib/video/models.ts:58-64`) seguem. Reprecificar com a metodologia do vídeo: premium ≈23 nodes, global/medium ≈6, localized ≈5, quickFix ≈3 — ou reduzir o cropCap do inpaint a ≤1MP e declarar tiers baixos como loss-leader com teto monitorado. **Conferir os USD na doc oficial da FAL antes.**
2. **[P0] /api/video: vídeo grátis possível** — débito pós-geração com erro engolido + pré-checagem no saldo errado (ver §6).
3. **[P1] Timeout não cancela o job FAL** — padrão `Promise.race` em ~12 call sites: a FAL pode completar e cobrar enquanto o usuário é refundado; `retry-on-timeout.ts` re-chama o endpoint pago (2 execuções pagas para 1 cobrança); fallback Topaz→Clarity idem. Migrar para `fal.queue.submit` + cancel, ou ao menos registrar attempts×endpoint por job.
4. **[P1] Sem registro de custo real por job** — só `image_edit_attempts.provider_cost_usd` (estimado). A FAL devolve metering/requestId no result e ninguém lê. Sem isso, mispricing só aparece na fatura mensal.
5. **[P1] Custos USD dos motores principais não documentados** (nano-banana-pro/2, gpt-image-2, topaz, clarity, nafnet, sam2) — margem dos módulos de MAIOR volume é não-verificável no repo. Criar `ENDPOINT_COST_USD` central (o padrão já existe no edit-router).
6. **[P2] Rotas gratuitas geram custo por request sem teto** (analyze, video/analyze, segment/SAM2) — vetor de abuso e custo orgânico invisível.
7. **[P2] Gemini recebe imagem full-res inline** (`lib/gemini.ts:82-89`) — um resize para ~1024-1536px + JPEG q80 em `fetchImagePart` corta custo/latência de TODAS as análises num único ponto.
8. **[P2] Upscale de vista usa factor 4 fixo para 4K** mesmo partindo de 2K (`vistas/[vistaId]/upscale/route.ts:91`) — saída ~8K, pagando ~4x megapixels desnecessários. Derivar factor da origem.
9. **[P2] Outputs caros vivem só no CDN da FAL** — TODO explícito em `video/route.ts:135`. Vídeo de 280 nodes pode expirar.
10. **[P2] Quality gate rejeita, refunda e MESMO ASSIM entrega `result_url` público** (`edits/route.ts:246-258`) — edição grátis utilizável; servir preview degradado/assinado.
11. **[P3]** Resultados de edição em PNG lossless full-res sem thumbnail; `EDIT_COST` morto; comentários citando Claude/GPT-4o (stale); fallback de plano desconhecido = 'beta' com 20 fixes grátis (`edit-free-fix.ts:14`) — trocar para 'free' (2).

### Arquitetura proposta: Cost Router v2
O editRouter já faz 70% (decisão endpoint+custo+free-fix ANTES do débito, telemetria de decisão). Falta generalizar:
- **Tabela `ai_cost_log`** (ou colunas padronizadas): `job_table, job_id, endpoint, provider, cost_usd_est, cost_usd_real (metering FAL), fal_request_id, duration_ms, attempts`.
- **Política de tiers por módulo:** premium (nano-banana-pro/gemini-3-pro) para complexo/4K; intermediário (nano-banana-2/flux-pro) padrão; barato (inpaint com crop ≤1MP, futuro Vertex Imagen US$0,02) para edição simples.
- **Fallback com contabilidade:** todo fallback registra as DUAS execuções no log de custo.
- **Cobrança por sucesso:** manter débito-antes+refund, mas com refund verificado (checar `{error}`) e status `refunded` gravado.
- **View de margem:** `nodes_charged × valor_node_do_plano − cost_usd × FX` por módulo/modelo/dia.

---

## 3. AUDITORIA DO MODO EDITAR

### Como funciona hoje
Canvas único (`RetocarCanvas.tsx`) compartilhado por standalone e Spaces; strokes em **coordenadas de tela**, máscara exportada reescalando para resolução natural. Server: `routeEdit()` (função pura) decide endpoint+custo 0–6 nodes+free-fix → attempt em `image_edit_attempts` → débito atômico → `runEdit()` (crop por bbox com teto de MP, chamada com retry, recomposição `recomposeMasked` com feather) → quality gate de drift fora-da-máscara (2%/8%) → persiste; erro → refund.

Engines e máscara (`endpoint-dispatch.ts`): máscara binária REAL: kontext-lora/inpaint, flux-pro/fill (e Vertex, desligado). Máscara como 2ª imagem+prompt (modelo pode ignorar): nano-banana, gemini-3-pro. **SEM máscara nenhuma: flux-pro/kontext (`usesMask:false`)**.

### Causas-raiz das dores (todas com evidência)

| Dor relatada | Causa-raiz encontrada |
|---|---|
| "Máscara não respeitada" | **[P0] `edit-router.ts:317`**: `if (isGlobalTool || largeMask || !hasMask || isComplex)` → flux-pro/kontext, que **não recebe a máscara** (payload sem mask_url), não passa pelo recompose e o gate é bypassado (`outOfMaskDelta=null`). Verificado manualmente; nuance: com máscara+referências escapa para nano-banana — o caso ruim é máscara SEM referência + área ≥40% ou prompt "complexo". |
| "Às vezes respeita, às vezes não" | **[P1] `classifyPromptComplexity`** (`:201-216`) pontua termos cotidianos ('estilo', 'layout', 'decoração') e os PRÓPRIOS chips da UI (`edit-presets.ts:30` injeta 'manter estilo arquitetônico') — o caminho feliz da UI empurra para o engine sem máscara. |
| Máscara deslocada | **[P1]** Strokes em px de display sem re-normalização: redimensionar a janela entre pintar e gerar projeta a máscara na posição errada (`RetocarCanvas.tsx:103-326`). |
| "Referência antiga/errada" | **[P1]** `hasRefs` conta QUALQUER papel e o engine usa cegamente `references[0]` como `reference_image_url` (`edit-router.ts:418`, `flux-kontext-lora-inpaint.ts:43`); 'Editar de novo'/'usar versão' **não limpam referências** (`RetocarStandaloneFlow.tsx:514-547`). |
| "Cobrança injusta" | **[P1]** Sem detecção de no-op: modelo erra a superfície → recompose descarta tudo → resultado ≈ idêntico, **cobrado** (não existe medição de mudança DENTRO da máscara). **[P1]** `mask_coverage` vem do cliente e nunca é recalculado no servidor (`edits/route.ts:107`) — free-fix/tier burlável e usuário honesto pode perder free-fix por superestimação. **[P2]** Refund engolido se o RPC falhar; status `refunded` nunca é gravado. |
| Qualidade da área editada | **[P2]** `recomposeMasked` usa `fit:'fill'` (estica/borra se o provider devolver outro aspecto/tamanho). **[P2]** Material sem referência cai em nano-banana (máscara = só prompt); o engine de inpaint forte (Vertex Imagen, US$0,02) é stub desligado. |
| Segurança | **[P2→P1]** SSRF: `source_image_url`/`mask_url`/`references[].url` aceitam URL arbitrária e o servidor faz `fetch(url)` sem allowlist (verificado adversarialmente; `/api/download` já tem o padrão `ALLOWED_HOSTS` correto para copiar). Sem validação de posse do recurso de origem. |

### Estrutura robusta proposta (incremental, não rebuild)
Contrato explícito de inputs: `image_input` (id interno, não URL crua), `mask_input`, `reference_image_input` + `material_reference_input` (selecionados **por role**, nunca `references[0]`), `prompt_instruction` (só o texto digitado entra no classificador), `edit_intent` (remove/replace_material/add_object/refine_area/change_color/clean_artifact — já quase existe como `tool`).
Regras invariantes do router: **(1) edição com máscara NUNCA roteia para endpoint `usesMask:false`; (2) complexity só promove DENTRO da família mask-aware; (3) referência só ancora se o role for compatível.** Validação pré-submit já existe (boa); adicionar: recálculo server-side da área da máscara, `inMaskDelta` (no-op → refund automático + status `no_change` + retry orientado), preview da máscara (já existe no fluxo de superfície), logging visual = persistir crop/mask/output por attempt (já persiste — adicionar `fal_request_id` e dims do provider).

### Política de cobrança proposta
Já existe 80% (0–6 nodes, free-fix por plano, refund em falha técnica E em rejeição do gate). Completar: reprecificar tiers (§2), refund **verificado** com status `refunded`, no-op = não cobrar, "tentar novamente" após falha evidente = grátis ou tier reduzido (1 node), teto de free-fix consecutivos por imagem contra abuso do gate.

---

## 4. AUDITORIA DO MODO RENDERIZAR

### Diagnóstico central
O prompt já é em camadas (`lib/prompts.ts`: âncora de materiais, fidelityModifier, PROJECT FACTS, material overrides, intent, lighting lock, mood wrappers, negativos consolidados, camera block) e os 3 engines são image-to-image de edição. **Porém:**

1. **[P1] O pipeline de duas etapas existe e está DESCONECTADO.** `app/api/analyze/route.ts` (Gemini vision → briefing com geometria/pavimentos/aberturas/câmera/elementos_preservar) **não tem nenhum caller** — grep zero. `buildFidelityPrompt` recebe `briefing=undefined` sempre no Renderizar standalone; o bloco PROJECT FACTS nunca entra no prompt do módulo mais usado. O Spaces USA exatamente esse briefing e tem fidelidade melhor por design. **É a causa mais direta de "recria demais". Religar é barato:** chamar `/api/analyze` quando fidelidade ≠ criativo (ou rodar `analyzeImage` server-side dentro do `/api/generate`), repassando `{briefing, inputUrl}` que a rota já aceita (`route.ts:84,101`).
2. **[P1, verificado adversarialmente] Gate de saldo da UI usa só `profiles.credits`** — bloqueia usuários com Lumens e membros de workspace (bolsa do dono cheia, saldo pessoal baixo). As páginas de apresentar já fazem certo (`user_node_balance`); generate/upscale/video não. Quebra o módulo principal para pagantes de Lumens e para a Fase 1.5.
3. **[P2] Fidelidade 100% prompt, sem verificação pós-geração** — `verifyDna` (threshold 0,85 + regeneração grátis) existe SÓ em Spaces. Portar um drift-check barato para o Renderizar + 1 re-roll grátis automático + logar o score por engine/nível (telemetria para calibrar prompts).
4. **[P2] Intent de Máxima sem âncora assume input "raw 3D/CAD"** mesmo quando é foto de obra (`prompts.ts:854-877`) — ordem ativa de reinterpretar shading inexistente. Ao religar a análise, adicionar `tipo_input: cgi|foto|sketch` ao briefing e ramificar o intent.
5. **[P2] Input degradado a 2048px JPEG para qualquer saída, inclusive 4K** (40 nodes) — perda de sinal geométrico fino (esquadrias, brises) no caso mais caro. Escalar o cap pelo destino (3072–4096px para 4K) com upload direto client→fal.storage.
6. **[P2] Controle "ESPAÇO" não afeta o prompt** — `buildFidelityPrompt` ignora `environment`; ENV_EN (~140 descrições) é dead code. Expectativa quebrada = "produto que não obedece". Decidir contrato (injetar em balanced/creative, ou rebaixar a metadado com copy honesta).
7. **[P2] Botão "Melhorar qualidade (2K/4K)" sempre regenera em 2K** hardcoded, cobra geração cheia, aparece até para quem já está em 4K, e o guard de saldo usa o custo da resolução errada.
8. **[P3]** Âncora encadeada (sempre o ÚLTIMO output) — drift composto em sessões de iteração; ancorar na 1ª geração aprovada. Re-upload do mesmo base64 a cada variação (a rota já aceita `inputUrl`). `geometryLock`/`fidelityMode` mortos.

### Recomendações de produto
- **Manter os 3 níveis (Máxima/Equilibrado/Criativo) como estão na UI** — o problema não é a escolha, é que os níveis só trocam texto. Tornar Máxima = análise prévia + intent correto por tipo de input + drift-check pós-geração. Automatizar a detecção do tipo de input (não pedir ao usuário).
- Prompt em camadas já existe; o ganho real vem de: (a) religar leitura da imagem, (b) restrições negativas por tipo de input, (c) verificação pós-geração com re-roll grátis. Zero mudança de UX visível além de "Analisando projeto…" no loading (texto já existe em LOADING_TEXTS).

---

## 5. AUDITORIA DE UX/UI PREMIUM

### Estado geral
Landing genuinamente mobile-first e bem resolvida (breakpoints, drawer, CTA fixo, trust line "40 nodes grátis"). O Editar é o fluxo mais maduro (preview de custo server-side, gate comunicado "Nenhum node foi consumido", comparador touch). **O contraste é o problema: o app autenticado não tem nenhuma adaptação mobile.**

### Achados
1. **[P0, verificado manualmente] Botão "+ comprar Nodes" do Renderizar está morto** — `fetch('/api/stripe/checkout', {method:'POST'})` sem body → 400 silencioso (`GenerateClient.tsx:535-539`). É o CTA de compra no momento de maior intenção. Apontar para /app/billing ou enviar payload válido.
2. **[P0] App autenticado inutilizável em mobile** — grid inline `480px 1fr` sem media queries (`GenerateClient.tsx:1203`), painel fixo 420px no Upscale, sidebar que expande só por hover (inexistente em touch), slider antes/depois mouse-only. **O tráfego pago vem do Instagram: a landing converte em mobile e o produto pós-login quebra na primeira geração** — desperdício direto de mídia. O padrão correto já existe no repo (`.spn-editar-grid`, BeforeAfterSlider por pointer events).
3. **[P1] Saldo lido de 3 fontes diferentes conforme a tela** (profiles.credits / user_node_balance / saldo do pagador na sidebar) — contadores divergentes, bloqueios falsos. Padronizar na fonte do PAGADOR.
4. **[P1] Dois CTAs dead-end "Disponível em agosto"** (alert nativo + stub `/api/billing/avulso-checkout` 503) convivendo com a venda real de Lumens em /app/billing — no momento de intenção de compra. "Agosto" já passou de validade (hoje: junho/2026).
5. **[P1] Falha de geração não comunica o estorno** — servidor refunda, usuário lê "Erro ao gerar render. Tente novamente." e não sabe se perdeu nodes. O Editar já resolve ("Nenhum node foi consumido") — replicar em Renderizar/Upscale/Vídeo, com `refunded: true/nodes` no payload de erro.
6. **[P1] Comparador do Upscale falseia o antes/depois** — `filter: blur(0.4px) contrast(0.9)...` no "antes" e realce no "depois" (`BeforeAfter.tsx:46,57`), admitido em comentário. Feature paga de até 56 nodes: arquiteto compara com o arquivo original e percebe. Remover filters, usar object-contain, oferecer zoom honesto.
7. **[P2] Jargão vazando:** 'Clarity (upscale)', 'Flux Fill (retoque)' em VistaDetail; tags 'Kling 2.5 Turbo Pro'/'Veo 3.1' nos cards do Animar (enquanto Renderizar mascara como Vega/Pulsar/Quasar). 'pixels fora da máscara', 'Upscale' vs 'Ampliar', 'Lumens' vs 'avulsos'.
8. **[P2] Chips de qualidade/engine do dashboard/histórico usam tabela de custos antiga** (4/8/20) — render Vega 2K (20 nodes) ganha chip "4K"; engineLabel rotula Pulsar como Vega. Metadado errado sobre o que o usuário pagou.
9. **[P2]** `alert/confirm/prompt` nativos em 14 pontos de telas core; tema claro forçado no Billing vs escuro hardcoded no resto; "análise" do Upscale é heurística de nome de arquivo com spinner fake de 400ms; vídeo de 1–4 min com "mantenha a aba aberta" sem recuperação comunicada; Renderizar sem orientação pré/pós-upload (primeira tela do trial!); barra de progresso fake de 40s que congela em 88%.
10. **[P3]** Funcionalidades-fantasma ('+ Pack' → alert 'Em breve.', 'Usar no Spaces' disabled, 'Ultra' trancado sem explicação).

### Propostas por tela (resumo)
- **Dashboard/Histórico:** corrigir chips (persistir engine+resolução), modais custom, agregação de pastas no banco.
- **Renderizar:** dicas no empty state ("vista única, imagem nítida, enquadramento reto"), recomendação pós-upload (padrão do banner verde do Upscale), estimativa "~40s", erro com estorno comunicado.
- **Editar:** já é referência; corrigir microcopy de drift ("A edição alterou áreas fora da seleção. Refazer é grátis.").
- **Upscale:** comparador honesto, análise com sinais reais (megapixels/bytes-por-pixel), remover delay fake.
- **Planos:** unificar tema, consertar funil avulso, esclarecer nodes/mês vs anual (ver §6).
- **Mobile:** breakpoint <900px no app: empilhar controles, bottom-nav, sliders por pointer events.

---

## 6. AUDITORIA DE CRÉDITOS/NODES, BILLING E STRIPE

### Matriz de risco verificada (rota × débito × refund)

| Rota | Débito | Refund em falha | Risco |
|---|---|---|---|
| /api/generate | antes ✔ | best-effort ⚠ não-verificado | refund silenciosamente falho |
| /api/spaces/.../generate(+sketches) | antes, por vista ✔ | por vista ⚠ | idem + erros internos crus ao client |
| /api/edits (+embebido) | antes ✔ | em falha E gate ⚠ | idem; `refunded` nunca gravado |
| /api/upscale, /api/vistas/.../upscale | antes ✔ | ⚠ | idem; upscale não grava custo no histórico |
| /api/apresentar/* | antes ✔ | ⚠ | idem |
| **/api/video** | **DEPOIS, erro engolido** ✖ | **não existe** ✖ | **vídeo grátis (P0, 2× verificado)** |

### Achados críticos
1. **[P0, verificado manualmente] RLS de `profiles` permite o usuário setar `credits`/`plan` via PostgREST.** Policy `users_update_own_profile` sem restrição de coluna (`supabase-schema.sql:62-66`); nenhuma migration faz REVOKE por coluna (grep confirmado); o próprio client já faz UPDATE direto em profiles (prova do caminho aberto). `PATCH /rest/v1/profiles {"credits":999999,"plan":"office"}` funciona para qualquer logado. **Fix: REVOKE UPDATE + GRANT por coluna (full_name, project_materials, project_config).** Conferir se houve revoke manual não-versionado em produção.
2. **[P0, 2× verificado] /api/video** — detalhado acima. Corrigir para o padrão do /api/generate (débito antes, P0001→402, refund no catch) e pré-checagem via `user_node_balance` do pagador.
3. **[P0, verificado manualmente] Assinante anual recebe nodes 1×/ano, UI vende "nodes/mês"** (`webhook:88` só refila em `subscription_cycle`; `BillingClient.tsx:111`). Pro anual = 1.800 nodes/ano vs 21.600 do mensal. Decisão de produto urgente + refil mensal via cron (guardando `last_refill_at`) ou copy/precificação corrigida. Risco CDC/chargebacks.
4. **[P1, verificado] Webhook Stripe responde 200 em falha de DB** (ativação, renovação, cancelamento, e também o `add_lumen_pack`) — Stripe não retenta; pagamento sem produto se perde em console.error efêmero. **E** não há dedupe de `event.id`: re-entrega re-executa `SET credits`, restaurando saldo já consumido. Fix: tabela `stripe_events` (PK event_id) + retornar 500 em falha de escrita (updates já são retry-safe).
5. **[P1] Refund best-effort nunca detecta falha** — `admin.rpc` não lança; o `catch` é código morto e o log diz "Refund executado" mesmo quando falhou. Em 10 arquivos. Fix: helper único `refundNodes()` checando `{error}` + linha `refund_pending` para reconciliação.
6. **[P1] Upgrade de plano cria SEGUNDA subscription** — checkout não verifica `stripe_subscription_id` existente; a antiga continua cobrando. Dupla cobrança garantida no primeiro upgrade real. Fix: `subscriptions.update` com proration ou Billing Portal.
7. **[P1] Pre-checks e `balance_after` usam o saldo do MEMBRO; débito vai no DONO** — membro de escritório com saldo pessoal 0 recebe 402 com a bolsa cheia (quebra a Fase 1.5 recém-lançada). Fix: `getPayerId` em todos os pre-checks.
8. **[P1] `consume_credits` legado possivelmente SEM guard em produção** (comentário explícito na migration 20260507000000:48-52) — se executável por `authenticated`, permite drenar saldo de terceiros por UUID. **Conferir em produção e dropar/revogar.**
9. **[P1] Jobs órfãos**: rotas longas sem `maxDuration` (só video/upscale/apresentar têm); kill da função = débito sem refund + vista/attempt em 'processing' eterno; **não existe nenhum reaper** (pg_cron não instalado, vercel.json sem crons). Fix: maxDuration explícito + cron de reconciliação (15 min) que falha+refunda jobs presos.
10. **[P1] Não existe ledger.** Proposta concreta:
    - `node_ledger (id, user_id, payer_id, workspace_id, delta, kind ∈ {debit,refund,grant_signup,grant_plan,grant_renewal,grant_lumen,expiry,adjustment}, source, job_table, job_id, stripe_event_id, balance_after, created_at)` — preenchido DENTRO de `consume_nodes_v2`/`refund_nodes`/`add_lumen_pack` (mesma transação); `UNIQUE (kind, job_table, job_id)` previne refund duplo.
    - `ai_cost_log (id, job_table, job_id, provider, endpoint, cost_usd_est, cost_usd_real, fal_request_id, duration_ms, created_at)`.
11. **[P2]** Double-submit no extract-dna (guard read-then-write) = débito duplo de 8 nodes; `invoice.paid` lê só `lines.data[0]` (proration quebra renovação); histórico com custo em 2 colunas e upscale gravando default 1; painel de saldo insuficiente chama stub 503; free-fix com corrida read-modify-write.
12. **[P3]** `charge.refunded`/dispute/`invoice.payment_failed` não tratados; status `refunded` nunca usado; expire-lumens nunca agendado.

### Status de jobs
`renders`: só INSERT em sucesso (falha não deixa rastro — taxa de falha imensurável). `vistas`: pending/processing/completed/failed ✔. `image_edit_attempts`: o conjunto completo incl. refunded/rejected_quality_gate, mas `refunded` nunca é escrito. **Alvo:** todos os módulos com pending→processing→succeeded/failed/refunded/cancelled + reaper para processing órfão (generalizar o padrão do Editar).

---

## 7. AUDITORIA SUPABASE, STORAGE, RLS E ESCALABILIDADE

### RLS
- **[P0]** `profiles` UPDATE sem restrição de coluna (§6.1).
- **[P1]** `vistas_update_own` idem: cliente pode zerar `free_fixes_used` (reabre correções grátis com custo USD real) e adulterar `nodes_cost`/`review_status` (corrompe relatórios da Equipe). Mesmo racional para policies de escrita de `image_edit_attempts` (escrita é toda via service_role — podem ser dropadas).
- **[P1] DRIFT GRAVE:** `edits`, `walkthroughs`, `shots` não têm DDL no repo; o GET `/api/edits` confia 100% na RLS de uma tabela invisível e **não filtra por user_id** (`route.ts:345`). Se a RLS de produção estiver permissiva, vaza edições entre usuários — inauditável pelo repo. Fix: `supabase db dump` → versionar baseline; adicionar `.eq('user_id')` como defesa em profundidade; corrigir timestamps duplicados; commitar a migration untracked.
- Pontos positivos: funções com `search_path` fixado e EXECUTE revogado de authenticated (hardening 20260508000002/20260603000001/20260608000002); views sensíveis com security_invoker; tabelas de auditoria deny-all; `uq_wm_one_active_per_user`.

### Storage
- **[P2→P1 com o tempo]** 2 buckets **públicos** com `getPublicUrl` permanente e não-revogável — projetos confidenciais de clientes acessíveis para sempre por quem tiver a URL (vazamento por compartilhamento/referrer/logs), inclusive após exclusão de conta. Migrar assets privados para bucket privado + signed URLs TTL; público só para /p/[slug].
- Renderizar/Ampliar/Animar/Apresentar nem chegam ao Supabase: **tudo no CDN da FAL sem SLA de retenção** (TODO explícito no código). O histórico/portfólio inteiro do arquiteto depende disso. Re-hospedar outputs (prioridade: vídeo).

### Índices e queries
- **[P2]** Falta `renders(user_id, created_at DESC)` composto — a maior tabela do produto, paginada por exatamente esse par (`renders/list/route.ts:20`). Considerar parcial para `ambient='video'`; índice em `profiles(email)` (lookup de convite).
- **[P3]** `history/page.tsx:22` carrega `folder_id` de TODOS os renders do usuário por page view — agregar no banco.

### Lifecycle (proposta)
| Classe | Conteúdo | Política |
|---|---|---|
| ORIGINAL | upload do usuário | permanente (re-hospedado) |
| OUTPUT | render/edição/vídeo final | permanente (re-hospedado do CDN FAL) |
| PREVIEW/THUMB | webp/jpeg q80 + thumb gerados no upload | permanente, serve a UI |
| TEMP | crops, crop-masks, máscaras, sketches órfãos | 7–30 dias se não referenciados |
| TENTATIVAS failed/rejected | attempts + assets | 90 dias |
Implementar com pg_cron (habilitar — também destrava expire-lumens já escrito) ou Vercel Cron.

### Workspaces (futuro)
Modelo atual sólido para a Fase 1.5. Lacunas para o roadmap: `spaces`/`packs`/`render_folders` sem `workspace_id` (biblioteca compartilhada exigirá backfill — adicionar agora, barato); `workspace.type` vira 'office' e nunca reverte; `review_status` sem `reviewed_by/reviewed_at`; `generations.workspace_id ON DELETE SET NULL` perde atribuição de custo (preferir soft-delete de workspace). Estrutura futura: papéis owner/admin/member já existem; adicionar permissões por projeto (tabela `space_members` ou visibility enum), billing por workspace = já encaminhado pela bolsa (formalizar com `payer_id` no ledger), biblioteca da equipe = `edit_reference_assets.workspace_id`.

---

## 8. AUDITORIA DE OBSERVABILIDADE E CONFIABILIDADE

### Estado
Zero APM/error tracking (sem Sentry/instrumentation.ts), 141 `console.*` em app/api sem estrutura; logs de produção incluem **prompt completo + URLs de imagens de clientes + payload FAL inteiro** (`generate/route.ts:189-231`, falAdapter). Os eventos mais críticos do negócio (FALHA NO REFUND, DB INSERT FALHOU pós-cobrança, webhook Stripe falho) são `console.error` efêmeros. Exceção positiva: `image_edit_attempts` é o embrião correto de telemetria por job; `upscale_meta` guarda requestId+duration (só em sucesso).

### Achados (todos verificados adversarialmente exceto 7-12)
1. **[P0/P1] Débito de vídeo nunca verificado** (§6).
2. **[P1] Webhook 200-em-falha** (§6).
3. **[P1] Orçamento de timeout do Ampliar estoura o maxDuration**: Topaz 240s + fallback Clarity 180s = 420s > 300s — a função morre exatamente no cenário que o fallback cobre; refund nunca roda. Fix barato: Topaz ≤150s quando há fallback, ou deadline dinâmico.
4. **[P1→P2] Tudo é request síncrona longa** — zero `fal.queue`/webhook; kill = job pago sem rastro (vídeo: sem cobrança e sem histórico). Migrar vídeo+upscale para fila+polling; mínimo: timeout explícito no falAdapter (hoje NENHUM — roda até a função morrer).
5. **[P1] Sem reconciliação de 'processing' órfão** (§6.9).
6. **[P1] Zero error tracking** — instalar @sentry/nextjs ou instrumentation.ts+onRequestError com alertas nos 3 pontos críticos.
7. **[P1] maxDuration ausente** nas rotas de geração/edição; /api/edits pode precisar 360s+ (object-removal 180s ×2 retries).
8. **[P2] Falhas não deixam rastro em banco** (renders só grava sucesso) — generalizar `image_edit_attempts` numa tabela `ai_jobs` única: `(id, user_id, payer_id, module, endpoint, provider, status, nodes_charged, nodes_refunded, cost_usd_est, fal_request_id, duration_ms, error_code, error_message, input_mp, resolution, created_at, completed_at)`. Instrumentar nos pontos únicos: /api/generate, generateOne() do Spaces, runEdit(), runUpscalePipeline(), falAdapter.generate(), generateWithRetry().
9. **[P2] Logs com dados sensíveis e sem estrutura** — `lib/log.ts` com 1 linha JSON/evento (module, level, user_id, job_id, endpoint, duration_ms, nodes, error_code); URLs reduzidas a hash; verbosidade por env (padrão já existe em logEditRoute).
10. **[P2] requestId da FAL descartado** em quase todos os call sites — impossível reconciliar com a fatura FAL. Padrão pronto nos providers de upscale; mudança mecânica.
11. **[P2] Painel admin inexistente.** MVP: rota `app/app/admin` (gate por `profiles.role='admin'` ou allowlist), 4 blocos server-rendered: jobs 7d por modelo (volume/taxa de falha/p50-p95), margem por módulo (nodes×valor − cost_usd×FX), últimas 50 falhas com user_id, usuários com 3+ falhas/24h.
12. **[P3] Retry de cold-start só no Editar**; spaces/generate vaza mensagens internas de Postgres ao cliente.

### Rate limiting (verificado: ZERO em qualquer camada)
O débito atômico limita o prejuízo nas rotas pagas ao saldo do atacante, mas: `/api/analyze`, `/api/video/analyze`, `/api/edits/segment` (SAM2) e `/api/edits/preview` são **grátis e ilimitados** (custo Gemini/SAM2/storage por request — conta free criada de graça já basta) e `/api/waitlist` é público floodável (além de aceitar INSERT direto via PostgREST com `with check (true)`). Fix: limite por user.id (e IP nas públicas) via Upstash/@vercel/kv ou Vercel Firewall — N/min + teto diário para free.

---

## 9. PRIORIZAÇÃO PARA LANÇAMENTO

### P0 — crítico antes do lançamento
| # | Item | Impacto | Esforço | Arquivos prováveis | Risco se não for feito |
|---|---|---|---|---|---|
| P0-1 | REVOKE/GRANT por coluna em `profiles` (e `vistas`) | usuário se dá nodes/plano grátis | baixo | nova migration | perda financeira ilimitada |
| P0-2 | /api/video: débito antes + refund + saldo do pagador | vídeo grátis (item mais caro) | baixo/médio | app/api/video/route.ts | sangria por corrida/erro silencioso |
| P0-3 | Webhook Stripe: dedupe event.id + 500 em falha de DB | pagamento sem produto; re-entrega restaura saldo gasto | médio | webhook/route.ts + migration stripe_events | perda de receita + suporte manual |
| P0-4 | Decidir e implementar refil do plano anual (vs copy "nodes/mês") | quebra de promessa comercial | médio | webhook, cron, BillingClient, lib/plans | chargebacks/CDC |
| P0-5 | Reprecificar tiers do Editar (conferir doc FAL antes) | margem negativa estrutural | baixo | edit-router.ts | prejuízo proporcional ao uso |
| P0-6 | Router do Editar: máscara nunca vai a endpoint usesMask:false | dor nº1 do Editar + cobrança injusta | baixo | edit-router.ts:317, edit-pipeline | churn no módulo em reconstrução |
| P0-7 | Consertar CTA "+ comprar Nodes" + funil avulso (stub "agosto") | conversão no momento de intenção | baixo | GenerateClient, InsufficientBalancePanel, AvatarComConsumo | receita perdida diariamente |
| P0-8 | App mobile mínimo viável (generate empilhado + nav touch) | tráfego Instagram converte e quebra | alto | GenerateClient, Sidebar, layout | mídia paga desperdiçada |
| P0-9 | SSRF: allowlist de host em fetchImageBuffer + rotas de edição | varredura de rede interna | médio | edit-crop.ts, edits/*, padrão de download/route.ts | incidente de segurança pré-lançamento |
| P0-10 | Conferir em produção: `consume_credits` sem guard; RLS de `edits` | dreno de saldo de terceiros; vazamento entre usuários | baixo (verificação) | dashboard Supabase + migrations | superfície morta com risco puro |

### P1 — muito importante para lançamento
Unificar fonte de saldo no PAGADOR em pre-checks/UI/balance_after (todas as rotas + generate/upscale/video pages) · refund verificado com helper único + status `refunded` · `maxDuration` em todas as rotas FAL + orçamento Topaz/Clarity · reaper de jobs 'processing' + refund (cron 15min) · `node_ledger` + `ai_cost_log` dentro dos RPCs · religar pré-análise no Renderizar + intent por tipo de input · classifyPromptComplexity (excluir texto de chips; nunca derrubar máscara) · referências por role + limpeza ao re-editar · mask_coverage recalculado server-side · detecção de no-op (inMaskDelta) com refund · strokes normalizados no canvas · upgrade de assinatura sem segunda subscription · Sentry/instrumentation + alertas nos 3 pontos críticos · rate limit nos endpoints grátis · comunicar estorno em falha (todas as telas) · comparador honesto do Upscale · versionar baseline do schema de produção (edits/walkthroughs/shots/config_snapshot/project_materials) · re-hospedar output de vídeo no Supabase Storage.

### P2 — importante após lançamento
ai_jobs unificada + requestId FAL persistido · painel admin MVP · fila FAL (queue+webhook) para vídeo/upscale · índice renders(user_id, created_at DESC) + profiles(email) · lifecycle de storage + pg_cron (e expire-lumens) · buckets privados com signed URLs · downscale no fetchImagePart do Gemini · factor de upscale derivado da origem · drift-check pós-geração no Renderizar + re-roll grátis · contrato do controle ESPAÇO · cap de resolução por destino (4K) · chips de qualidade/engine corretos · modais custom no lugar de alert/confirm/prompt · tema unificado · jargão (engineDisplayName, tags de vídeo) · orientação pré/pós-upload no Renderizar · double-submit do extract-dna · invoice.paid multi-linha · padronizar nodes_charged · log estruturado lib/log.ts · preview rejeitado pelo gate com URL assinada/degradada · recompose fit correto · análise real no Upscale · microcopy de tempo de espera.

### P3 — melhoria futura
Vertex Imagen inpaint como rota mask-anchored padrão · âncora fixa na 1ª geração · reuso de inputUrl nas variações · limpeza de código morto (engines legados, EDIT_COST, ENV_EN, geometryLock, buildGenerationPrompt) · charge.refunded/dispute/payment_failed · spaces.workspace_id + reviewed_by/at + reversão de type · thumbnails/webp dos resultados de edição · agregação de pastas no banco · waitlist com captcha/restrição · funcionalidades-fantasma removidas · retry de cold-start no Renderizar · fallback de plano desconhecido 'beta'→'free'.

---

## 10. PLANO DE EXECUÇÃO

### Fase 1 — Segurança, billing, nodes e custos (1–2 semanas)
**Objetivo:** nenhum caminho conhecido de perda financeira, cobrança errada ou escalada de privilégio.
**Tarefas:** P0-1, P0-2, P0-3, P0-5, P0-9, P0-10 + refund verificado, payer unificado, maxDuration, reaper, ledger, rate limit dos grátis, P0-7 (CTAs), decisão do anual (P0-4).
**Arquivos:** migrations novas (revoke profiles/vistas, stripe_events, node_ledger, ai_cost_log, índices), app/api/video/route.ts, app/api/stripe/webhook/route.ts + checkout, helper lib/billing/refund.ts, lib/workspaces/context.ts (getPayerBalance), edit-router.ts (preços), edit-crop.ts (allowlist), rotas (maxDuration), cron de reconciliação.
**Testes:** unit do routeEdit (preços/rotas), integração do webhook com eventos replay (stripe CLI), corrida de double-submit no video/extract-dna, smoke de refund com RPC mockado falhando, RLS via PostgREST com JWT de usuário (tentar PATCH credits).
**Critérios de aceite:** PATCH profiles.credits → 403/no-op; 2 vídeos concorrentes com saldo p/ 1 → exatamente 1 sucesso; replay de webhook → saldo inalterado; falha de DB no webhook → 500 e retry do Stripe; toda linha de débito/refund aparece no node_ledger; nenhum tier do Editar abaixo de 50% de margem no piso (com USD conferidos na doc FAL); fetch de URL interna → 400.
**Riscos:** revoke por coluna pode quebrar UPDATEs legítimos do client (mapear todos antes: project_materials, project_config); reprecificação do Editar muda preço percebido (comunicar).
**Rollback:** migrations de revoke são reversíveis (GRANT de volta); webhook/vídeo: revert de commit; ledger é aditivo (não muda saldo).

### Fase 2 — Renderizar (1 semana)
**Objetivo:** melhorar fidelidade sem mudar a UX.
**Tarefas:** religar /api/analyze (ou analyzeImage server-side) quando fidelidade ≠ criativo; tipo_input no briefing e intent ramificado; guard de saldo da UI pelo pagador; consertar botão "Melhorar qualidade"; cap de resolução por destino; reuso de inputUrl; logar drift-score (preparação para re-roll grátis na Fase 5).
**Arquivos:** GenerateClient.tsx, app/api/generate/route.ts, lib/fidelity-engine.ts, lib/prompts.ts, app/app/generate/page.tsx.
**Testes:** snapshot de prompts por (nível × com/sem briefing × tipo_input); A/B manual com 10 imagens reais (CGI, foto de obra, sketch) comparando drift.
**Aceite:** PROJECT FACTS presente no prompt quando Máxima/Equilibrado; foto de obra não recebe intent "raw CAD"; usuário com Lumens consegue gerar.
**Riscos:** +5–20s de latência pela análise (mitigar com loading copy existente); mudança de prompt pode regredir casos — manter flag de env para desligar a análise.
**Rollback:** flag desliga a pré-análise; prompts versionados em lib/prompts.ts (revert simples).

### Fase 3 — Editar confiável (1–2 semanas)
**Objetivo:** máscara sempre respeitada, referência sempre certa, cobrança sempre justa.
**Tarefas:** invariantes do router (P0-6 + complexity + refs por role); mask_coverage server-side; inMaskDelta/no-op com refund; strokes normalizados; limpeza de referências ao re-editar; recompose com aspect check; status refunded; (P3 puxado se houver fôlego: Vertex Imagen).
**Arquivos:** edit-router.ts, edit-pipeline.ts, edit-crop.ts, edit-prompts.ts, RetocarCanvas.tsx, RetocarStandaloneFlow.tsx, engines/flux-kontext-lora-inpaint.ts.
**Testes:** suíte de routeEdit por matriz (tool × máscara% × refs × premium × plano); teste manual obrigatório: pintar → redimensionar janela → gerar; smoke pago mínimo por endpoint (já existe edit-router.smoke.mjs).
**Aceite:** com máscara, endpoint escolhido sempre usesMask:true; chips oficiais não mudam o roteamento; referência 'estilo' não vira material; no-op → 0 nodes; coverage do cliente divergente do real → log + valor do servidor decide.
**Riscos:** mudar roteamento muda resultados visuais para usuários atuais — soltar atrás de flag com telemetria comparativa.
**Rollback:** flag de roteamento v1/v2; recompose e gate já isolados.

### Fase 4 — UX premium e mobile (1–2 semanas)
**Objetivo:** fluxo Instagram→signup→primeira geração funcionando em mobile; consistência premium.
**Tarefas:** P0-8 (breakpoints no generate, bottom-nav/drawer, sliders pointer events); estorno comunicado; modais custom; tema unificado; jargão; chips corretos; orientação pré/pós-upload; comparador honesto; microcopy de tempo.
**Arquivos:** GenerateClient, UpscaleClient, AnimateClient, Sidebar, layout, BeforeAfter, HistoryClient, VistaDetail, BillingClient, globals.css.
**Testes:** preview em 390/768/1280px de cada tela core; fluxo completo signup→render em viewport mobile.
**Aceite:** primeira geração completável num iPhone; zero alert/confirm nativos nas telas core; zero nomes de modelo de fornecedor na UI.
**Riscos:** refactor de layout em arquivos de 1300–1800 linhas — fazer por tela, com screenshot diffs.
**Rollback:** por tela (commits independentes).

### Fase 5 — Observabilidade, admin e custos (1 semana)
**Objetivo:** ver o negócio: margem, falhas, jobs.
**Tarefas:** ai_jobs + instrumentação nos 6 pontos únicos; requestId persistido; lib/log.ts + remoção de payloads sensíveis; Sentry/alertas; painel admin MVP; fila FAL para vídeo/upscale; re-hospedagem de outputs; drift-check + re-roll grátis no Renderizar.
**Aceite:** dashboard responde "taxa de falha por modelo, custo USD hoje, margem por módulo"; alerta dispara em refund falho.
**Rollback:** tudo aditivo.

### Fase 6 — Workspaces/escritórios (contínuo)
**Objetivo:** preparar a estrutura sem retrabalho.
**Tarefas:** spaces.workspace_id + carimbo; reviewed_by/at; reversão de type; soft-delete de workspace; biblioteca de referências da equipe (edit_reference_assets.workspace_id); permissões por projeto; billing por workspace formalizado no ledger (payer_id já previsto).
**Riscos:** baixos — aditivo, volume ainda pequeno.

---

## A) TOP 10 MELHORIAS MAIS IMPORTANTES
1. Travar RLS de profiles/vistas (REVOKE por coluna) — fecha o maior buraco financeiro.
2. Corrigir /api/video para débito-antes + refund + saldo do pagador.
3. Webhook Stripe idempotente com retry (stripe_events + 500 em falha).
4. Router do Editar: máscara nunca descartada + classifier sem falso-positivo dos chips.
5. Religar a pré-análise (Fidelity Engine) no Renderizar + intent por tipo de input.
6. Unificar fonte de saldo no pagador (UI + pre-checks + balance_after) — destrava Lumens e Equipes.
7. node_ledger + ai_cost_log dentro dos RPCs — auditabilidade de cada node e cada dólar.
8. App autenticado mobile-first (generate, sidebar, sliders).
9. Consertar o funil de compra (CTA morto, stub "agosto", estorno comunicado).
10. Reaper de jobs órfãos + maxDuration + Sentry — nenhuma falha silenciosa com dinheiro envolvido.

## B) TOP 10 REDUÇÕES DE CUSTO
1. Reprecificar os tiers do Editar (premium 5→~23 nodes ou teto de loss-leader) — margem negativa estrutural hoje.
2. fal.queue + cancel no timeout (hoje todo timeout pode pagar o job 2x: abandonado + retry).
3. Downscale no fetchImagePart do Gemini (1 ponto, todas as análises: DNA, briefing, verifyDna, moodboard).
4. Rate limit + teto diário nos endpoints grátis (analyze, segment/SAM2, video/analyze).
5. Upscale factor derivado da origem (2K→4K = 2, não 4 — ~4x megapixels pagos a menos).
6. cropCap do inpaint ≤1MP para quickFix/localized (US$0,035/MP × 3MP = US$0,105 num tier de 1–2 nodes).
7. Registrar cost_usd_real + fal_request_id por job (detecta mispricing na semana, não na fatura).
8. Cap de resolução de input por destino + reuso de inputUrl nas variações (banda/storage da FAL).
9. Preview rejeitado pelo quality gate com URL assinada/degradada (hoje entrega resultado grátis utilizável).
10. Thumbnails/webp dos resultados de edição + lifecycle de temporários (storage/egress crescem linearmente).

## C) TOP 10 RISCOS
1. Auto-atribuição de credits/plan via PostgREST (RLS de profiles) — explorável hoje por qualquer logado.
2. Cobrança do vídeo: corrida TOCTOU + erro engolido = item mais caro entregue grátis.
3. Promessa "nodes/mês" para plano anual que refila 1x/ano — jurídico/chargeback.
4. Editar operando abaixo do custo — prejuízo cresce com o sucesso do módulo.
5. Drift repo×produção (edits/walkthroughs/shots sem DDL; RLS inauditável; DR impossível a partir do repo).
6. Webhook 200-em-falha + sem dedupe — pagamentos perdidos e saldos restaurados silenciosamente.
7. SSRF nas rotas de edição (fetch de URL arbitrária server-side).
8. Histórico inteiro no CDN da FAL sem SLA — portfólio de clientes pode evaporar.
9. App desktop-only com mídia paga mobile — queima de verba de aquisição no onboarding.
10. Zero observabilidade de falha (sem Sentry, renders só grava sucesso, refund falho invisível) — qualquer um dos riscos acima aconteceria sem ninguém saber.

## D) PROMPT DE IMPLEMENTAÇÃO DA FASE 1

```
Você vai implementar a FASE 1 (segurança, billing, nodes e custos) da auditoria do SPACENODE.
Leia antes: docs/AUDITORIA-SPACENODE-2026-06-09.md (seções 2, 6, 8 e o plano da Fase 1).
Crie uma branch nova fix/fase1-seguranca-billing a partir de main e trabalhe nela.

GUARDRAILS OBRIGATÓRIOS:
- NÃO aplique nenhuma migration em produção: gere os arquivos em supabase/migrations/ e PARE para eu revisar/aplicar.
- NÃO faça deploy, NÃO altere variáveis de ambiente, NÃO toque no dashboard do Stripe/Supabase.
- Valide com tsc/lint/build local a cada bloco. Commits pequenos, um tema por commit.

TAREFAS (nesta ordem):
1. RLS profiles/vistas: antes de tudo, grep por `.from('profiles').update(` e `.from('vistas').update(` em todo o client para mapear colunas legitimamente atualizadas pelo browser (hoje: project_materials, project_config em GenerateClient.tsx:328,360). Migration: REVOKE UPDATE ON public.profiles FROM authenticated; GRANT UPDATE (full_name, project_materials, project_config) ON public.profiles TO authenticated. Mesmo racional para public.vistas (manter só is_favorited; favorite já tem rota server). Dropar policies de escrita de image_edit_attempts (escrita é 100% service_role).
2. /api/video (app/api/video/route.ts): mover o débito para ANTES de adapter.generate usando consume_workspace_nodes com checagem do {error} (P0001 → 402); refund_workspace_nodes verificado no catch; pré-checagem via saldo do PAGADOR (getPayerId de lib/workspaces/context.ts + user_node_balance), não profiles.credits do membro; gravar nodes_charged (não cost_credits) e checar o erro do INSERT em renders; adicionar timeout explícito no falAdapter (~270s).
3. Webhook Stripe (app/api/stripe/webhook/route.ts): migration stripe_events(event_id text primary key, type text, created_at timestamptz default now()); no início do handler INSERT ... ON CONFLICT DO NOTHING e sair se já processado; retornar 500 (para o Stripe retentar) quando QUALQUER escrita no Supabase falhar (ativação :56, lumens :71, renovação :117, cancelamento :139); em invoice.paid, iterar TODAS as invoice.lines procurando price conhecido (findPlanByStripePriceId), não só lines.data[0].
4. Refund verificado: criar helper único (ex.: lib/billing/refund-nodes.ts) que chama refund_workspace_nodes, CHECA {error}, loga JSON estruturado e grava status 'refunded' na attempt/vista quando aplicável; se o refund falhar, gravar marca 'refund_pending' (coluna ou node_ledger) para o reaper. Substituir os ~10 call sites (generate, edits ×2, spaces/generate ×2, upscale ×2, apresentar ×4).
5. Saldo do pagador em todo lugar: helper getPayerBalance(admin, userId); usar nos pre-checks e no balance_after de generate, edits, spaces/generate(+sketches), upscale, vistas/upscale, video e apresentar/*; e nos initialCredits de app/app/generate/page.tsx, upscale/page.tsx, video/page.tsx (padrão correto já existe nas páginas de apresentar).
6. maxDuration=300 em todas as rotas que chamam FAL sem export (generate, edits, spaces/generate, generate-from-sketches, vistas/upscale); reduzir TIMEOUT_MS do Topaz para 150_000 quando houver fallback (lib/upscale/providers/topaz.ts).
7. Reaper: rota app/api/cron/reconcile protegida por CRON_SECRET + entrada em vercel.json crons (15 min): vistas e image_edit_attempts com status 'processing' e created_at < now()-15min → status 'failed' + refund via helper do item 4 + log do volume.
8. Ledger (migrations aditivas): node_ledger(id, user_id, payer_id, workspace_id, delta int, kind check in ('debit','refund','grant_signup','grant_plan','grant_renewal','grant_lumen','expiry','adjustment'), source text, job_table text, job_id uuid, stripe_event_id text, balance_after int, created_at, UNIQUE(kind, job_table, job_id)) preenchido DENTRO de consume_nodes_v2/refund_nodes/add_lumen_pack (CREATE OR REPLACE preservando assinaturas e grants service_role); ai_cost_log(id, job_table, job_id, provider, endpoint, cost_usd_est numeric, cost_usd_real numeric, fal_request_id text, duration_ms int, created_at) preenchido nas rotas no ponto de persistência (começar por edits, generate, video).
9. SSRF: assertSafeImageUrl(url) — exige https, resolve host, allowlist = fal.media/v2.fal.media/v3.fal.media + host do Supabase Storage do projeto (derivar de NEXT_PUBLIC_SUPABASE_URL); aplicar em fetchImageBuffer (lib/spaces/edit-crop.ts:35) e nas rotas que aceitam URL do cliente (edits, edits/segment, edits/references/crop, vistas/edit embebido). Reusar o padrão de app/api/download/route.ts.
10. CTAs de compra: handleBuyCredits do GenerateClient (POST sem body → 400 silencioso) → redirecionar para /app/billing; InsufficientBalancePanel e AvatarComConsumo → checkout real de Lumens (/api/stripe/checkout {type:'lumen'}) ou CTA de upgrade para free/starter; remover o stub /api/billing/avulso-checkout e os alert('Disponível em agosto').
11. Rate limit simples por user.id nos endpoints grátis (analyze, video/analyze, edits/segment, edits/preview): contador em tabela Supabase (janela de 1 min + teto diário) é suficiente nesta fase; 429 com mensagem amigável.
12. Checkout de plano: se profile.stripe_subscription_id ativo, NÃO criar segunda subscription — bloquear com mensagem clara apontando para o Billing Portal (ou implementar subscriptions.update com proration se preferir).
13. Trocar FALLBACK_PLAN de 'beta' para 'free' em lib/spaces/edit-free-fix.ts:14.

PARE E ME PERGUNTE antes de: (a) aplicar qualquer migration; (b) decidir refil mensal vs copy do plano anual (P0-4 — decisão de produto); (c) fixar os novos preços do Editar (vou conferir a doc oficial da FAL primeiro — me peça os valores); (d) dropar/revogar consume_credits legado (preciso conferir o estado em produção antes).

CRITÉRIOS DE ACEITE:
- PATCH /rest/v1/profiles {"credits":999999} com JWT de usuário → recusado; update de project_materials continua funcionando.
- 2 POSTs concorrentes em /api/video com saldo para 1 → exatamente 1 sucesso e 1 402; débito antes da geração.
- Replay do mesmo event.id no webhook → no-op; falha de DB no webhook → 500.
- Toda geração/falha/refund gera linha no node_ledger com balance_after consistente.
- fetch de URL interna (http://10.0.0.1, 169.254.169.254) em /api/edits → 400 antes de qualquer fetch.
- tsc, lint e build verdes; nenhuma rota FAL sem maxDuration.
```
