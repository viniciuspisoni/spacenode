# AREA: custos

## MAP
## Inventário de call sites de IA

**LLM (Gemini direto, gemini-2.5-flash via lib/gemini.ts:97 generateContent, retry 3x com backoff):** (1) briefing arquitetônico do Renderizar — app/api/analyze/route.ts:30 faz fal.storage.upload e lib/fidelity-engine.ts:105 chama geminiVisionJson (grátis, sem débito); (2) DNA do Spaces — app/api/spaces/[spaceId]/extract-dna/route.ts:81 cobra 8 nodes e roda 2 calls de visão em paralelo (lib/spaces/dna.ts:150-155: DNA visual + briefing via analyzeImage; briefing é reusado do config_snapshot quando o Space nasce de uma render — cache correto); (3) verifyDna pós-geração — app/api/vistas/[vistaId]/verify-dna/route.ts:62 (grátis, idempotente via dna_verified); (4) moodboard — lib/apresentar/moodboard.ts:223 (8 nodes); (5) prancha/carrossel — lib/apresentar/board.ts:145 geminiTextJson (6 nodes). A imagem vai INLINE base64 sem downscale (lib/gemini.ts:82-89).

**FAL imagem:** Renderizar — app/api/generate/route.ts:203 (upload) e :222 fal.subscribe no endpoint de lib/engines.ts: vega=fal-ai/nano-banana-pro/edit (20/40 nodes 2K/4K), pulsar=fal-ai/nano-banana-2/edit (10/15/25 HD/2K/4K), quasar=openai/gpt-image-2/edit (28/56). Spaces generate (app/api/spaces/[spaceId]/generate/route.ts:330) e generate-from-sketches (:266) usam os mesmos engines com débito por vista (lib/spaces/economy.ts: pulsar 10-25, vega 20-40, quasar 28-56) e refund por falha. Upscale de vista — app/api/vistas/[vistaId]/upscale/route.ts:102 fal-ai/clarity-upscaler (8/16 nodes). Editar (standalone app/api/edits/route.ts e embebido app/api/spaces/[spaceId]/vistas/[vistaId]/edit/route.ts) roteia via lib/spaces/edit-router.ts (0-6 nodes) para: fal-ai/flux-kontext-lora/inpaint (US$0,035/MP, com crop limitado a 1,5-3,0 MP — lib/spaces/edit-router.ts:438-448), fal-ai/flux-pro/v1/fill (US$0,04), fal-ai/nano-banana/edit (US$0,039), fal-ai/flux-pro/kontext (US$0,04), fal-ai/gemini-3-pro-image-preview/edit (US$0,15) e fal-ai/sam2/image (segmentação de superfície, flag OFF, sem débito — app/api/edits/segment/route.ts). Upscale módulo — app/api/upscale/route.ts:112 upload e lib/upscale/orchestrator.ts despacha topaz/clarity/nafnet/photo-restoration (3 a 50+ nodes via computeUpscaleCost; Topaz tem fallback silencioso pra Clarity). Apresentar — humanized-plan/route.ts:132 e isometric/route.ts:110 (vega 2K, 20 nodes), moodboard/route.ts:118 (upload de referência).

**FAL vídeo:** app/api/video/route.ts:90-92 (uploads) → lib/video/adapters/falAdapter.ts:87 fal.subscribe — Kling 2.5 Turbo Pro (US$0,07/s; 60/120 nodes), Veo 3.1 (US$0,20/s; 140/210/280 nodes), Seedance 2.0 oculto (US$0,682/s 1080p — margem negativa, isAvailable=false). Custos documentados em lib/video/models.ts:66-69, calibrados pra margem ≥50% no piso.

## Economia

Valor do node: piso R$0,0729 (Office anual 583/8000 — lib/plans.ts:62-71), FX R$5,40 ⇒ US$0,0135/node (~74 nodes/US$). Melhor caso: Lumen 500 a R$0,178/node (lib/lumens.ts:18). Vídeo tem margem documentada ~57-58% no piso (ok). DNA (8 nodes ≈ US$0,108) e moodboard/prancha (8/6 nodes) contra 1-2 calls de flash custam centavos — margem altíssima. O problema grave é o Editar: a tabela NODE_COST (1-6 nodes = US$0,0135-0,081 no piso) fica ABAIXO do próprio ENDPOINT_COST_USD do arquivo (US$0,035-0,15) em quase todos os tiers — premium 5 nodes cobra US$0,0675 e paga US$0,15. Renderizar/Spaces/Upscale não têm custo USD por endpoint documentado em lugar nenhum (nano-banana-pro, nano-banana-2, gpt-image-2, topaz, clarity, nafnet, photo-restoration, sam2) — margem não-verificável no código, conferir doc oficial.

## Cobrança e ledger

Padrão dominante: débito atômico (consume_workspace_nodes → consume_nodes_v2, plano→Lumens FIFO, lock FOR UPDATE) ANTES da chamada FAL, com refund best-effort em falha — correto em generate, spaces, edits, upscale e apresentar. A exceção é o vídeo (app/api/video/route.ts:137-152): cobra DEPOIS da geração num Promise.all cujo erro de RPC é ignorado, e a pré-checagem usa profiles.credits (ignora Lumens e bolsa do workspace). Registro de custo interno: só image_edit_attempts.provider_cost_usd (estimado por tabela, não real — migration 20260603000000:30); renders/vistas/video não têm cost_usd/engine duration; upscale_meta guarda steps+duration_ms mas sem custo. Não existe ledger de margem por job.

## Router/fallback

O editRouter (lib/spaces/edit-router.ts) já decide endpoint+custo+free-fix antes do débito, com crop por MP, telemetria de decisão e provider derivado; o router legado do Retocar (lib/spaces/engines/router.ts) tem fallback Google→Flux silencioso; o upscale (lib/upscale/orchestrator.ts) tem Topaz→Clarity. Falta para um "cost router" completo: custo REAL por job (a FAL devolve metering no result; hoje só estimativa em 1 tabela), ledger de margem por operação/usuário, e cancelamento de jobs em timeout (todos os Promise.race abandonam o job FAL sem cancelar — o provider pode completar e cobrar enquanto o usuário é refundado; retry-on-timeout.ts ainda re-chama o endpoint, podendo pagar 2x por 1 cobrança).

## Resolução/compressão

Renderizar comprime no client (2048px JPEG q0.92 — GenerateClient.tsx:113-137). Editar recorta máscara com teto de MP e recompõe em PNG lossless full-res (edit-crop.ts:362-366) salvo no Supabase sem thumbnail. Gemini recebe imagem full-res inline sem resize. Upscale de vista usa factor 4 fixo pra target 4K mesmo partindo de 2K. Outputs FAL (renders, vídeo) ficam no CDN do FAL sem cópia/retenção garantida (TODO em video/route.ts:135). Nota menor: lib/spaces/edit-economy.ts (EDIT_COST 6/12/24) está morto — nenhum caller; e edit-free-fix.ts:14 usa fallback 'beta' (20 fixes grátis/mês) pra plano desconhecido.

## FINDINGS

### [P0] 1. Vídeo: débito pós-geração com erro ignorado + pré-checagem de saldo errada (vídeo grátis possível)
- files: app/api/video/route.ts:79-86; app/api/video/route.ts:137-152
- evidence: app/api/video/route.ts:137-152: `await Promise.all([admin.from('renders').insert({...}), admin.rpc('consume_workspace_nodes', { user_id_input: user.id, amount: nodeCost })])` — o retorno do rpc nunca é checado (supabase-js não lança; o `{error}` é descartado). A cobrança acontece DEPOIS de 1-4 min de geração. A pré-checagem (linhas 79-86) usa `profiles.credits` direto: `if (!profile || profile.credits < nodeCost)` — ignora Lumens (user_node_balance) e a bolsa do workspace (o débito real vai pro DONO via consume_workspace_nodes, mas a checagem olha o saldo do MEMBRO).
- impact: Perda financeira direta: 2 requests paralelos (ou saldo consumido durante a geração) passam na pré-checagem, geram vídeos de US$0,35-1,60 cada no FAL e o débito de 60-280 nodes falha em silêncio — vídeo entregue de graça. Inverso também: usuário com saldo só em Lumens é bloqueado (402) mesmo tendo nodes — perda de receita/conversão. Membro de workspace é validado pelo saldo errado.
- recommendation: Mover o débito para ANTES da chamada ao adapter (mesmo padrão de /api/generate), com refund best-effort em falha; trocar a pré-checagem para a view user_node_balance/total do pagador (dono do workspace). No mínimo, checar o `error` do rpc no Promise.all e logar/alertar em falha de cobrança.
- effort: baixo
- (sem verificacao adversarial)

### [P0] 2. Editar: tabela de cobrança 0-6 nodes abaixo do custo USD documentado dos próprios endpoints (premium fortemente negativo)
- files: lib/spaces/edit-router.ts:126-163; lib/spaces/edit-router.ts:278-287; supabase/migrations/20260603000000_edit_router_v1.sql:30
- evidence: lib/spaces/edit-router.ts:126-141 define NODE_COST (quickFix:1, localized:2, medium:3, global:4, premium:5, premiumHeavy:6) e :148-163 define ENDPOINT_COST_USD: gemini-3-pro-image-preview/edit US$0,150/imagem, flux-kontext-lora/inpaint US$0,035/MP, flux-pro/v1/fill US$0,040, nano-banana/edit US$0,039, flux-pro/kontext US$0,040. No piso (node R$0,0729, FX 5,40 ⇒ US$0,0135/node): premium 5 nodes = US$0,0675 de receita vs US$0,15 de custo (margem -122%); premiumHeavy 6 = US$0,081 vs US$0,15 (-85%); quickFix 1 = US$0,0135 vs ≥US$0,035 (crop de até 3,0 MP em cropCap, :438-448 ⇒ até US$0,105); localized 2 = US$0,027 vs US$0,035-0,105; medium 3 = US$0,0405 vs US$0,039-0,040 (~0%); global 4 = US$0,054 vs US$0,040 (26%, abaixo da regra de ≥50% citada no próprio comentário :146).
- impact: Toda edição premium perde dinheiro em TODOS os planos de assinatura (até no Lumen 500, melhor node a R$0,178, a margem é só ~9%). Tiers 1-3 são negativos/zerados no piso. Com o free-fix (0 nodes, custo US$0,035-0,105) somado, o módulo Editar inteiro opera abaixo do custo — quanto mais uso, maior o prejuízo. Contradiz a regra de margem-piso ≥50% aplicada ao vídeo (lib/video/models.ts:58-64).
- recommendation: Reprecificar os tiers usando a mesma metodologia do vídeo: premium ≥ 23 nodes (US$0,15×2÷0,0135 ≈ 22,2 p/ 50% no piso), global ~6, medium ~6, localized ~5 (ou reduzir o cropCap do inpaint para ≤1 MP), quickFix ~3. Alternativa: declarar explicitamente os tiers baixos como loss-leader com teto mensal e monitorar via provider_cost_usd. Conferir os USD hardcoded na doc oficial da FAL antes (valores de 2026-06).
- effort: baixo
- (sem verificacao adversarial)

### [P1] 3. Timeout via Promise.race não cancela o job FAL e retry/fallback paga o provider 2x por 1 cobrança
- files: app/api/generate/route.ts:221-226; app/api/spaces/[spaceId]/generate/route.ts:329-334; lib/spaces/engines/retry-on-timeout.ts:25-48; lib/upscale/orchestrator.ts:71-99; lib/upscale/providers/topaz.ts:36-44
- evidence: Padrão repetido em ~12 call sites: `Promise.race([fal.subscribe(endpoint, {...}), new Promise((_, reject) => setTimeout(() => reject(new Error('FAL_TIMEOUT')), FAL_TIMEOUT_MS))])` (ex.: app/api/generate/route.ts:221-226, 90s). O job no FAL NÃO é cancelado — pode completar e ser cobrado, enquanto a rota refunda os nodes do usuário. lib/spaces/engines/retry-on-timeout.ts:25-48 re-chama o MESMO endpoint pago após timeout (callWithTimeoutRetry, usado em todo o edit-pipeline); lib/upscale/orchestrator.ts:81-92 cai de Topaz (timeout 240s, provavelmente completado) para Clarity — 2 providers pagos para 1 job cobrado.
- impact: Custo de provider sem receita correspondente em todo timeout: o usuário recebe refund (ou paga 1x) e a empresa paga 1-2 execuções FAL. Em pico de cold-start (motivo declarado do retry), o custo real por edição/upscale pode dobrar sem nenhum registro.
- recommendation: Migrar chamadas longas para fal.queue.submit + cancel no timeout (test-fal-models.js já demonstra o uso de queue), ou pelo menos registrar attempts×endpoint por job (ledger) para quantificar o desperdício. No orchestrator, considerar custo do fallback no preço do modo fidelity.
- effort: medio
- (sem verificacao adversarial)

### [P1] 4. Sem ledger de custo real por job — provider_cost_usd só existe (estimado) em image_edit_attempts
- files: supabase/migrations/20260603000000_edit_router_v1.sql:30; app/api/generate/route.ts:257-274; app/api/video/route.ts:137-149; supabase/migrations/20260527000000_upscale_meta.sql:23-31; lib/spaces/edit-router.ts:505-512
- evidence: Única coluna de custo interno é image_edit_attempts.provider_cost_usd (migration 20260603000000:30), preenchida por estimateProviderCostUsd (edit-router.ts:505-512) — tabela estática, não o metering real da FAL. renders (insert em generate/route.ts:257-274) grava engine/resolution/nodes_charged mas nenhum cost_usd/duration; vídeo grava cost_credits (nodes) e nada de USD; upscale_meta guarda steps/duration_ms sem custo; vistas só nodes_cost. Nenhuma rota lê o campo de billing/metering retornado pela FAL.
- impact: Impossível vigiar a margem por operação/usuário/modelo — exatamente o que o comentário de edit-router.ts:146 diz querer fazer. Mispricing (como o do Editar) só seria descoberto na fatura mensal da FAL. Sem custo real também não dá para validar os USD hardcoded.
- recommendation: Padronizar colunas cost_usd_estimated, cost_usd_real (do response da FAL quando disponível), endpoint e duration_ms em renders/vistas/video e nas attempts; criar uma view de margem (nodes_charged×valor_node_do_plano − cost_usd×FX). Preencher em todas as rotas no mesmo ponto onde hoje se loga o output.
- effort: medio
- (sem verificacao adversarial)

### [P1] 5. Custos USD dos motores principais (Renderizar/Spaces/Upscale) não documentados — margem não verificável
- files: lib/engines.ts:22-50; lib/upscale/costs.ts:25-44; lib/spaces/economy.ts:14-42; lib/upscale/providers/topaz.ts:1-21
- evidence: lib/engines.ts:22-50 fixa nodes por engine×resolução (vega/nano-banana-pro 20/40, pulsar/nano-banana-2 10/15/25, quasar/gpt-image-2 28/56) sem nenhum custo USD de referência no código. lib/upscale/costs.ts:25-32 diz 'valores calibrados para refletir custo FAL real + margem' mas não documenta o custo (Topaz, Clarity, NAFNet, Photo Restoration); topaz.ts:4 só diz 'custo FAL > Clarity'. lib/spaces/economy.ts:3-4 admite 'Validar contra custos reais do FAL nas primeiras semanas'. SAM2 (sam2-segment.ts) também sem custo.
- impact: Os módulos de MAIOR volume (Renderizar e Spaces, 10-56 nodes por geração) não têm verificação de margem possível dentro do repo. Se o nano-banana-pro 4K ou o gpt-image-2 'high' custarem acima de ~US$0,27-0,54/imagem, a margem fura o piso de 50% sem ninguém perceber. Upscale 8x (multiplicador 5×) idem.
- recommendation: Conferir na doc oficial de preços da FAL os endpoints fal-ai/nano-banana-pro/edit, fal-ai/nano-banana-2/edit, openai/gpt-image-2/edit, fal-ai/topaz/upscale/image, fal-ai/clarity-upscaler, fal-ai/nafnet, photo-restoration e fal-ai/sam2/image (NÃO assumir valores) e registrar um ENDPOINT_COST_USD central como o do edit-router, usado pelo ledger do achado anterior.
- effort: medio
- (sem verificacao adversarial)

### [P2] 6. Rotas de análise gratuitas geram custo de API por request sem débito nem rate limit
- files: app/api/analyze/route.ts:16-42; app/api/video/analyze/route.ts:15-39; app/api/edits/segment/route.ts:29-90
- evidence: app/api/analyze/route.ts:16-36: por request autenticado faz fal.storage.upload + 1 call Gemini vision — 'NÃO consome Nodes'. app/api/video/analyze/route.ts idem. app/api/edits/segment/route.ts:29-61 (atrás de flag) chama fal-ai/sam2/image + 2 uploads ao Storage por gesto de pintura, sem débito. Nenhuma das três tem rate limiting ou contagem por usuário.
- impact: Custo variável (Gemini flash vision + SAM2 + storage egress) proporcional a cliques do usuário, sem receita e sem teto — vetor de abuso barato (loop de requests autenticados) e custo orgânico invisível quando a segmentação de superfície ligar (1 SAM2 por pincelada confirmada).
- recommendation: Adicionar rate limit por usuário (ex.: N análises/min e teto diário) e contabilizar essas chamadas no ledger de custo (mesmo a 0 nodes). Para o SAM2, considerar embutir o custo no node do tier de material ou cachear a máscara por (imagem, blob) hash.
- effort: baixo
- (sem verificacao adversarial)

### [P2] 7. Gemini Vision recebe imagem full-res inline — sem downscale antes da análise
- files: lib/gemini.ts:82-89; lib/spaces/dna.ts:55-66; lib/fidelity-engine.ts:103-116; lib/apresentar/moodboard.ts:222-230
- evidence: lib/gemini.ts:82-89 (fetchImagePart) baixa a URL e converte o buffer INTEIRO pra base64 inline, sem resize: `const buf = Buffer.from(await res.arrayBuffer()); return createPartFromBase64(buf.toString('base64'), mimeType)`. Callers passam renders 2K/4K (vista_mestre_url, vista.image_url) e referências de moodboard de até 20 MB (moodboard/route.ts:115).
- impact: Custo de tokens de imagem do Gemini (tiles por resolução) e latência maiores que o necessário em TODAS as análises (DNA, briefing, verifyDna por vista, moodboard) — verifyDna roda 1x por vista gerada, então escala com o volume de geração. Também aumenta timeouts (IMAGE_FETCH_TIMEOUT_MS 15s) e retries.
- recommendation: No fetchImagePart, redimensionar com sharp para ~1024-1536px no maior lado e re-encodar JPEG q~80 antes do base64 — análise de estilo/paleta/briefing não precisa de 4K. Um único ponto de mudança cobre todos os callers.
- effort: baixo
- (sem verificacao adversarial)

### [P2] 8. Upscale de vista usa upscale_factor 4 fixo para target 4K mesmo partindo de 2K
- files: app/api/vistas/[vistaId]/upscale/route.ts:91-100; lib/spaces/economy.ts:40-42
- evidence: app/api/vistas/[vistaId]/upscale/route.ts:91: `const scaleFactor = target === '4k' ? 4 : 2` — não considera src.quality. Uma vista já em 2K (≈2048px) com target 4K recebe upscale_factor 4 → saída ≈8K, pagando ao Clarity ~4x mais megapixels de saída do que o necessário (2x bastaria), pelos mesmos 16 nodes (economy.ts:40-42).
- impact: Custo FAL por job de upscale 2K→4K potencialmente ~4x acima do necessário (Clarity cobra por pixel de saída — conferir doc oficial), além de latência maior e risco de timeout (FAL_TIMEOUT_MS 120s) gerando refund com job pago.
- recommendation: Derivar o factor da resolução real de origem: factor = alvo_px / origem_px (2k→4k = 2; hd→4k = 4; hd→2k = 2). Opcional: ajustar o custo em nodes pelo factor efetivo.
- effort: baixo
- (sem verificacao adversarial)

### [P2] 9. Output de vídeo (60-280 nodes) fica só no CDN da FAL, sem retenção garantida
- files: app/api/video/route.ts:135-149
- evidence: app/api/video/route.ts:135-136: 'TODO: copy output video to permanent Supabase Storage before public production release. Currently output_url is a CDN link with no documented retention SLA.' — o insert em renders grava o output_url do CDN da FAL direto.
- impact: O asset mais caro do produto (até US$1,60 de custo e 280 nodes de receita) pode expirar do CDN — usuário perde o vídeo pago, gera suporte/refund manual e re-geração (custo dobrado). O mesmo vale para imagens de renders/vistas que apontam pro CDN da FAL.
- recommendation: Copiar o vídeo (e idealmente as imagens de render) para Supabase Storage no fluxo de persistência, gravando a URL própria; manter a do CDN só como fallback temporário.
- effort: medio
- (sem verificacao adversarial)

### [P2] 10. Quality gate do Editar entrega result_url público sem cobrança após refund
- files: app/api/edits/route.ts:231-258; app/api/spaces/[spaceId]/vistas/[vistaId]/edit/route.ts:273-307; lib/spaces/edit-pipeline.ts:29-34
- evidence: app/api/edits/route.ts:246-258: quando out_of_mask_delta excede o gate (0,02 ou 0,08 blend), a rota refunda os nodes e MESMO ASSIM devolve `result_url: run.resultUrl` — URL pública do Supabase Storage (uploadEditAsset usa getPublicUrl, edit-route-helpers.ts:148). O custo do provider já foi pago (e possivelmente 2x, via retry).
- impact: Edições rejeitadas custam provider + storage e rendem 0 nodes, com o resultado utilizável pelo usuário (URL pública permanente). Usuário que aprende o padrão (máscaras que induzem drift) consegue edições de graça; mesmo sem abuso, é custo recorrente invisível — só rastreado em image_edit_attempts.status='rejected_quality_gate'.
- recommendation: Servir o preview rejeitado com marca d'água/resolução reduzida ou via URL assinada de curta duração; monitorar a taxa de rejected_quality_gate por usuário e limitar tentativas grátis consecutivas.
- effort: baixo
- (sem verificacao adversarial)

### [P3] 11. Resultados de edição persistidos em PNG lossless full-res, sem thumbnail/variante comprimida
- files: lib/spaces/edit-crop.ts:362-366; lib/spaces/edit-route-helpers.ts:126-150; app/api/edits/route.ts:340-354
- evidence: recomposeMasked retorna `.png().toBuffer()` da imagem inteira (edit-crop.ts:362-366) e uploadEditAsset sobe o buffer como veio para o bucket space-mestres (edit-route-helpers.ts:126-150). Um render 4K em PNG facilmente passa de 10-20 MB; o GET /api/edits lista 60 edits cujo histórico carrega essas URLs cheias. Crops e crop-masks intermediários também ficam no bucket para sempre.
- impact: Custo crescente de storage + egress no Supabase (cada edição grava result + crop + crop-mask) e UX lenta no histórico. O PNG lossless é necessário só como fonte de novas edições, não para exibição.
- recommendation: Gerar variante webp/jpeg q80 + thumbnail no upload (sharp já está no caminho) e usar a comprimida na UI/histórico; agendar limpeza dos assets crop/crop-mask órfãos após N dias.
- effort: medio
- (sem verificacao adversarial)

### [P3] 12. Fontes de custo mortas/stale induzem decisão errada de pricing
- files: lib/spaces/edit-economy.ts:9-17; app/api/analyze/route.ts:8-14; lib/apresentar/config.ts:68; lib/apresentar/config.ts:81; lib/spaces/dna.ts:119-121; lib/spaces/edit-free-fix.ts:13-29
- evidence: lib/spaces/edit-economy.ts: EDIT_COST (hd 6 / 2k 12 / 4k 24) não tem nenhum caller no repo (grep só encontra a própria definição) — tabela fantasma ao lado da NODE_COST real. app/api/analyze/route.ts:12 diz 'Chama Claude 3.5 Sonnet via fal-ai/any-llm/vision' mas o código usa Gemini direto; lib/apresentar/config.ts:68 e :81 justificam 6/8 nodes como 'Claude via Fal'; lib/spaces/dna.ts:119-120 fala em 'GPT-4o' e 'Claude Sonnet via FAL'. edit-free-fix.ts:14 dá fallback 'beta' (20 fixes grátis/mês) pra qualquer plano desconhecido no banco.
- impact: Risco de recalibrar preço usando a tabela errada ou assumir custo de LLM antigo (Claude/GPT-4o são mais caros que gemini-2.5-flash); fallback 'beta' concede 10x mais fixes grátis que o plano free se um plano novo entrar sem mapeamento.
- recommendation: Remover EDIT_COST/getEditCost; atualizar os comentários para Gemini (gemini-2.5-flash); trocar o FALLBACK_PLAN de 'beta' (20) para 'free' (2) antes do lançamento.
- effort: baixo
- (sem verificacao adversarial)
