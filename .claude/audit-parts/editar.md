# AREA: editar

## MAP
PIPELINE DO MODO EDITAR (auditado em C:/Users/Pisoni/spacenode)

UI. Dois fluxos compartilham o mesmo canvas (components/spaces/RetocarCanvas.tsx): standalone (app/app/editar/page.tsx → components/spaces/RetocarStandaloneFlow.tsx, 1801 linhas) e embebido no Spaces (components/spaces/RetocarOverlay.tsx). O canvas guarda pinceladas em coordenadas de TELA (strokes em px do display), renderiza overlay vermelho 50%, e exporta a máscara via getMaskBlob() reescalando para a resolução natural (sx = naturalSize.w/size.w, RetocarCanvas.tsx:307-326) — PNG P&B (branco=editar). Há validação pré-submit (máscara pintada, prompt obrigatório exceto remove, saldo — RetocarStandaloneFlow.tsx:334-347), preview de custo/rota debounced via POST /api/edits/preview, toggle premium explícito, painel de referências (1 ativa por papel, máx 3) e validação client-side pós-resultado (validateOutsideMaskPreservation, limite 2%). Ferramentas "Suavizar/Expandir/Reduzir máscara" e "Selecionar parede/piso" são placeholders "Em breve" (RetocarStandaloneFlow.tsx:1296-1341).

FLUXO SERVER. POST /api/edits (standalone, app/api/edits/route.ts) e POST /api/spaces/[spaceId]/vistas/[vistaId]/edit (embebido) seguem o mesmo desenho: (1) buildRoutingContext (lib/spaces/edit-route-helpers.ts) lê origem (renders/vistas: generated_by_spacenode, free_fixes_used), plano (profiles.plan) e uso mensal (user_monthly_usage); (2) routeEdit() (lib/spaces/edit-router.ts, função pura) decide endpoint + custo 0–6 nodes + isFreeFix; (3) insere tentativa em image_edit_attempts (status processing); (4) débito atômico consume_workspace_nodes (bolsa do dono do workspace, migration 20260609000000); (5) runEdit() (lib/spaces/edit-pipeline.ts) executa; (6) quality gate de drift fora da máscara; (7) persiste edits/vistas + bump_monthly_usage; em erro: refund_workspace_nodes + tentativa failed.

ROTEAMENTO (edit-router.ts). Tiers: premium opt-in → fal-ai/gemini-3-pro-image-preview/edit (5–6 nodes, US$0,15/img); correção grátis (Spacenode + remove/fix + máscara ≤15% + cota por imagem/mês, teto por plano em edit-free-fix.ts: free 2, starter 10, pro 25, studio 60, office 80, beta 20); edição ampla/global/SEM máscara/prompt "complexo" → fal-ai/flux-pro/kontext (4 nodes, US$0,04); quick fix 1 node e localizada 2 nodes → maskedToolEndpoint: remove→flux-pro/v1/fill (US$0,04), material/add COM referência→flux-kontext-lora/inpaint (US$0,035/MP, com crop), material/add SEM referência→nano-banana/edit (US$0,039), fix_detail sem ref→inpaint; média 15–40% → 3 nodes mesmo endpoint. Vertex imagen-edit (US$0,02) é stub desligado (VERTEX_IMAGEN_ENABLED=false).

MÁSCARA × ENGINES (endpoint-dispatch.ts). Máscara binária REAL (mask_url): flux-kontext-lora/inpaint e flux-pro/v1/fill. Máscara como 2ª IMAGEM + prompt (modelo pode ignorar): nano-banana/edit, gemini-3-pro/edit, nano-banana-2. SEM máscara nenhuma: flux-pro/kontext (usesMask:false — payload nem envia mask_url).

PIPELINE (edit-pipeline.ts + edit-crop.ts). Para usesMask: baixa imagem+máscara, normaliza dims, crop por bbox+padding 25% (mín 32px) com teto de MP (1.5–3.0 conforme ferramenta/resolução), padding de aspecto ≤2:1 para o inpaint, chamada com retry de timeout (1x), e recomposição recomposeMasked: alpha duro (threshold 110) ou feather (blur ~1.2% do lado menor) para material/replace/add; PNG lossless + keepMetadata. Gate: measureOutOfMaskDrift em 512px (threshold 12/canal); limites 2% (OUT_OF_MASK_GATE) e 8% blend; rejeição → status rejected_quality_gate (migration 20260603000002), refund, sem cota. Para !usesMask (Kontext): devolve o output como veio, outOfMaskDelta=null → gate NUNCA roda.

SUPERFÍCIE (flag NEXT_PUBLIC_EDIT_SURFACE_SEGMENTATION): /api/edits/segment usa SAM2 (fal-ai/sam2/image) com seeds derivados do blob; refineSurfaceMask usa a máscara do SAM sozinha (fix do bug "tapete") com fallback duro pro blob; modal de confirmação com preview verde; validação client é pulada quando a superfície é usada (supressão de drift falso-positivo, commit ec39443).

REFERÊNCIAS: upload (/api/edits/references/upload, downscale 2000px no browser), crop de foco (references/crop) e from-project; persistidas em edit_reference_assets; entram como image_urls extras (nano-banana/gemini) ou reference_image_url=references[0] (kontext-lora, exigido pelo schema; fallback = a própria imagem).

Legado morto: engines/router.ts (selectEngine), orchestrate.ts, guard-policy.ts, object-removal.ts, flux-inpaint.ts, gemini-edit (selectGeminiEngine) e EDIT_COST de edit-economy.ts não são usados por nenhuma rota viva.

## FINDINGS

### [P0] 1. Máscara pintada é silenciosamente IGNORADA quando o router escolhe Flux Pro Kontext (máscara ≥40% ou prompt 'complexo')
- files: lib/spaces/edit-router.ts:317; lib/spaces/engines/endpoint-dispatch.ts:32; lib/spaces/engines/flux-pro-kontext.ts:34; lib/spaces/edit-pipeline.ts:77; app/api/edits/route.ts:232
- evidence: edit-router.ts:317 `if (isGlobalTool || largeMask || !hasMask || isComplex)` → endpoint 'fal-ai/flux-pro/kontext' mesmo COM máscara desenhada (largeMask = hasMask && area>=0.40; isComplex independe de máscara). endpoint-dispatch.ts:32 marca `usesMask: false`; flux-pro-kontext.ts:34-41 monta payload SEM mask_url; edit-pipeline.ts:77-88 `if (!usesMask || !maskUrl)` devolve o output do provider como veio, com `outOfMaskDelta: null`; route.ts:232 só rejeita quando `run.outOfMaskDelta != null` → o quality gate é bypassado exatamente no único caminho que pode alterar a imagem inteira. composeRouterPrompt (edit-prompts.ts:252-263) ainda remove toda linguagem de 'área mascarada' do prompt.
- impact: Causa raiz confirmada da dor 1 ('máscara nem sempre respeitada') e da dor 2 ('textura em área errada'): o usuário pinta, paga 4 nodes, e o modelo reinterpreta a cena INTEIRA sem nenhuma proteção de recomposição nem gate. Também é cobrança injusta (dor 4): edição global indesejada é cobrada e salva.
- recommendation: Nunca rotear edição COM máscara para endpoint usesMask:false. Para largeMask/prompt complexo com máscara, usar nano-banana/edit ou gemini-3-pro (mask como 2ª imagem) + recompose, que já existem no pipeline. Se Kontext for mantido para máscara grande, aplicar recomposeMasked no output dele (a máscara existe!) e rodar o gate. Reservar Kontext exclusivamente para hasMask=false.
- effort: baixo
- (sem verificacao adversarial)

### [P1] 2. classifyPromptComplexity tem falso-positivo sistemático — os próprios chips/presets da UI empurram a edição para o engine sem máscara
- files: lib/spaces/edit-router.ts:201; lib/spaces/edit-router.ts:216; lib/spaces/edit-presets.ts:30; lib/spaces/edit-presets.ts:170
- evidence: COMPLEX_KEYWORDS (edit-router.ts:201-208) inclui termos cotidianos de arquitetura: 'estilo', 'layout', 'decoração', 'mobili', 'reforma'. O chip oficial keep-style injeta 'manter estilo arquitetônico do projeto' (edit-presets.ts:30) → +2 pontos; appendToPrompt encadeia frases (edit-presets.ts:170-177) elevando wordCount>16 (+1) e separadores (vírgulas nos presets, ' e ') (+1) → score≥3 = 'complex' → tier 3 → Flux Pro Kontext ignora a máscara (achado anterior). Ex.: 'aplicar concreto aparente. manter iluminação da cena. manter estilo arquitetônico do projeto.' vira 'complex'. Até o chip 'Aplicar apenas na área pintada' contribui para o score que faz a máscara ser ignorada.
- impact: Usuários que seguem o caminho feliz da UI (chips recomendados) caem no roteamento que descarta a máscara — comportamento errático percebido como 'às vezes respeita, às vezes não'. Cobrança de 4 nodes por edição global não pedida.
- recommendation: (1) Com máscara presente, complexity nunca deve mudar para endpoint sem máscara (só pode subir o modelo DENTRO da família mask-aware). (2) Excluir do classificador o texto adicionado por chips/presets (classificar só o texto digitado) ou remover keywords genéricas ('estilo', 'layout', 'decoração'). (3) Logar a complexity em image_edit_attempts para telemetria.
- effort: baixo
- (sem verificacao adversarial)

### [P1] 3. Strokes guardados em coordenadas de tela sem re-normalização — redimensionar a janela entre pintar e gerar desloca a máscara
- files: components/spaces/RetocarCanvas.tsx:103; components/spaces/RetocarCanvas.tsx:140; components/spaces/RetocarCanvas.tsx:188; components/spaces/RetocarCanvas.tsx:307
- evidence: Os pontos do stroke são capturados em px de display (relativePoint, RetocarCanvas.tsx:188-192) e armazenados crus (startStroke:194-203). O ResizeObserver (115-119) recalcula `size` quando o container muda (resize de janela, devtools, rotação, sidebar) e o canvas é redesenhado com os MESMOS pontos antigos sobre a imagem reescalada (redrawMask:140-159 não reescala pontos). getMaskBlob (307-326) exporta com `sx = naturalSize.w / size.w` ATUAL — pinceladas feitas antes do resize são projetadas na posição errada da resolução natural.
- impact: Máscara final enviada ao servidor não corresponde ao que o usuário vê/pintou → edição aplicada em área errada (dores 1 e 2) de forma intermitente e difícil de reproduzir, cobrada normalmente.
- recommendation: Armazenar strokes em coordenadas NORMALIZADAS (0–1) ou em coordenadas da resolução natural, convertendo para display só no desenho; ou re-mapear strokesRef ao mudar `size` (multiplicar por novoSize/antigoSize). Adicionar teste manual: pintar, redimensionar janela, gerar.
- effort: medio
- (sem verificacao adversarial)

### [P1] 4. Qualquer referência anexada (mesmo 'imagem original' ou 'estilo') vira reference_image_url do inpaint em material/add — reproduz a superfície antiga / usa referência errada
- files: lib/spaces/edit-router.ts:418; lib/spaces/engines/flux-kontext-lora-inpaint.ts:43; components/spaces/RetocarStandaloneFlow.tsx:514; components/spaces/RetocarStandaloneFlow.tsx:240
- evidence: edit-router.ts:418 `if ((tool === 'material' || tool === 'add') && hasRefs) return quickFixEndpoint()` — hasRefs conta QUALQUER papel. flux-kontext-lora-inpaint.ts:43 usa cegamente `references[0]?.url` como reference_image_url. A ordenação do payload (RetocarStandaloneFlow.tsx:240-245) só prioriza o papel principal SE ele existir; se o usuário anexou apenas 'Imagem original' (role original_image) ou 'Estilo', essa imagem vira a referência de material do inpaint → o modelo recria o material ANTIGO. Além disso, editAgainOnResult (514-524) e useVersionAsBase (537-547) NÃO limpam `references` — a textura da tentativa anterior continua ativa nas gerações seguintes (referências só zeram ao trocar de imagem, resetVersionsWithOriginal:172-180).
- impact: Dor 3 confirmada ('uso de referência antiga/imagem errada'): troca de material sai igual ao original ou com a textura da edição anterior; usuário paga 1–3 nodes por resultado errado.
- recommendation: (1) No router, o gatilho do caminho ancorado deve ser `hasRefs` filtrado por papel compatível (material_texture/object_reference), não qualquer referência. (2) No engine, selecionar a referência por ROLE explícito (material_reference_input) em vez de references[0]. (3) Na UI, limpar (ou pedir confirmação de manter) referências ao 'Editar de novo'/trocar de versão e ao trocar de ferramenta.
- effort: medio
- (sem verificacao adversarial)

### [P1] 5. Cobrança e cota grátis confiam no mask_coverage reportado pelo cliente — servidor nunca recalcula a área real da máscara
- files: app/api/edits/route.ts:107; lib/spaces/edit-route-helpers.ts:104; lib/spaces/edit-router.ts:292; lib/spaces/edit-pipeline.ts:92
- evidence: route.ts:107-109 aceita `body.mask_coverage` (só clampa 0–1); edit-route-helpers.ts:104 injeta como maskAreaRatio; edit-router.ts:292-301 decide grátis com `area <= 0.15` e tiers de 1–3 nodes com base nesse número. O servidor BAIXA a máscara real em runEdit (edit-pipeline.ts:92-96) mas nunca mede a fração branca. Um request com máscara 100% branca + mask_coverage=0.05 obtém free fix/2 nodes para reeditar a imagem inteira. No sentido inverso, o coverage do cliente conta qualquer alpha>0 (RetocarCanvas.tsx:236-239, inclui anti-aliasing) enquanto o servidor binariza em 110 — usuário honesto pode perder o free fix por superestimação.
- impact: Integridade de cobrança quebrada (perda financeira direta: tier de 4 nodes vendido a 0–2) e injustiça na cota grátis. Free fix abusável dentro do teto mensal.
- recommendation: Recalcular server-side a fração branca da máscara (mesmo scan reduzido de detectMaskBoundingBox, custo ~ms) antes do débito e usar esse valor em routeEdit; tratar o valor do cliente como apenas estimativa de preview. Logar discrepâncias em image_edit_attempts.
- effort: baixo
- (sem verificacao adversarial)

### [P1] 6. Nenhuma detecção de no-op: engine que devolve imagem inalterada (caso típico do nano-banana errar a superfície) cobra normalmente
- files: lib/spaces/edit-pipeline.ts:146; lib/spaces/edit-crop.ts:391; lib/spaces/engines/nano-banana-edit.ts:31; app/api/edits/route.ts:261
- evidence: nano-banana recebe a máscara só como 2ª imagem + prompt (nano-banana-edit.ts:31-39; mask-prompt.ts:27-51) — se o modelo aplicar o material em OUTRA superfície parecida, recomposeMasked (edit-pipeline.ts:146-169) descarta tudo fora do blob pintado e o resultado fica ≈ idêntico ao original. measureOutOfMaskDrift (edit-crop.ts:391-430) mede APENAS fora da máscara; não existe medição de mudança DENTRO da máscara. route.ts:261-308 persiste, cobra e incrementa uso mensal sem verificar se algo mudou.
- impact: Dor 4 ('cobrança injusta em edição falha') e o sintoma visível da dor 2: o usuário paga 2–4 nodes e recebe a mesma imagem (ou mudança imperceptível). Mina a confiança no produto.
- recommendation: Adicionar inMaskDelta ao runEdit (mesma técnica do drift, invertendo a condição m[p]>32) e, abaixo de um piso (ex.: <1% dos pixels da máscara mudaram), tratar como falha: refund + status 'no_change' + UI oferecendo retry/modo avançado. Registrar in_mask_delta em image_edit_attempts para calibrar.
- effort: medio
- (sem verificacao adversarial)

### [P2] 7. Refund engolido em caso de falha do RPC — usuário fica cobrado permanentemente; status 'refunded' nunca é usado
- files: app/api/edits/route.ts:330; app/api/spaces/[spaceId]/vistas/[vistaId]/edit/route.ts:384; supabase/migrations/20260603000002_edit_attempts_quality_gate.sql:9
- evidence: route.ts:330-333 `try { await admin.rpc('refund_workspace_nodes', ...) } catch (refundErr) { console.error(...) }` — se o refund falhar, só loga; a tentativa vira 'failed' sem marca de dívida e não há reconciliação. O CHECK da migration aceita status 'refunded' mas nenhum código o escreve, então não dá para auditar quem foi reembolsado.
- impact: Perda silenciosa de nodes do usuário em falha dupla (engine + refund); impossível reconciliar via image_edit_attempts.
- recommendation: Marcar a tentativa com status/flag 'refund_pending' quando o refund falhar e criar job/admin de reconciliação; gravar 'refunded' quando o refund ocorrer (hoje failed e refunded são indistinguíveis).
- effort: baixo
- (sem verificacao adversarial)

### [P2] 8. recomposeMasked redimensiona o output do provider com fit:'fill' — perda de resolução e distorção dentro da máscara nos engines per-image
- files: lib/spaces/edit-crop.ts:347; lib/spaces/engines/gemini-3-pro-edit.ts:26; lib/spaces/engines/gemini-edit.ts:36
- evidence: edit-crop.ts:347-349 `sharp(editedCropBuffer).resize(width, height, { fit: 'fill' })` — o próprio comentário (linhas 349-352) admite que nano-banana/fill/gemini devolvem OUTRO tamanho. fit:'fill' estica sem preservar aspecto: se o provider devolver aspecto diferente, o conteúdo dentro da máscara desalinha/distorce em relação à cena; se devolver 1K para uma fonte 4K, a área editada sobe interpolada (borrada) contra o entorno nítido. gemini-3-pro mapeia quality→resolution (1K/2K/4K) mas nano-banana/edit não envia resolution alguma (nano-banana-edit.ts:32-39).
- impact: Qualidade percebida da área editada cai (textura borrada/esticada), reforçando a sensação de 'edição errada' mesmo quando a máscara foi respeitada.
- recommendation: Comparar aspect ratio do output com a região: se divergir além de tolerância, usar fit 'cover' com crop central ou rejeitar/retry; enviar resolution/size hints onde o schema suportar e registrar dims do provider em image_edit_attempts para telemetria.
- effort: medio
- (sem verificacao adversarial)

### [P2] 9. SSRF e ausência de validação de posse: source_image_url, mask_url e references[].url aceitam URL arbitrária e são baixadas pelo servidor
- files: app/api/edits/route.ts:75; lib/spaces/edit-crop.ts:35; lib/spaces/edit-route-helpers.ts:159
- evidence: route.ts:75-76 aceita qualquer string como source_image_url/mask_url; parseReferences (edit-route-helpers.ts:159-178) aceita qualquer r.url; fetchImageBuffer (edit-crop.ts:35-39) faz `fetch(url)` sem allowlist de host nem limite de tamanho. As URLs também são repassadas à FAL e persistidas em edits/edit_reference_assets.
- impact: Permite sondar rede interna/metadata endpoints a partir das functions (resposta parcialmente observável via erro/status), processar imagens de terceiros sem posse, e baixar payloads grandes (custo/memória sharp).
- recommendation: Restringir a hosts permitidos (domínio público do Supabase Storage do projeto + CDN própria), validar Content-Type/Content-Length antes de bufferizar e, idealmente, referenciar assets por id interno em vez de URL crua.
- effort: medio
- (sem verificacao adversarial)

### [P2] 10. Sem máscara real nos engines 'duas-imagens' a aderência dentro da máscara é só prompt — falta engine de inpaint forte para material sem referência
- files: lib/spaces/edit-router.ts:419; lib/spaces/engines/mask-prompt.ts:27; lib/spaces/engines/vertex-imagen-edit.ts:26
- evidence: material/add SEM referência vai para nano-banana/edit (edit-router.ts:419), cuja 'máscara' é uma instrução textual (mask-prompt.ts:27-51: 'Image 2: binary mask — WHITE area = edit here'). O Vertex Imagen (inpaint com maskMode real, ~US$0,020) segue stub desligado (vertex-imagen-edit.ts:26-30, VERTEX_IMAGEN_ENABLED=false em edit-router.ts:170). O recompose protege o fora-da-máscara, mas dentro dela o modelo pode editar parcialmente ou nada (vira o no-op do achado 6).
- impact: A dor 2 persiste estruturalmente para o caso mais comum (trocar material descrevendo em texto, sem anexar textura): precisão da área editada depende do humor do modelo.
- recommendation: Priorizar a integração Vertex Imagen inpaint (ou usar flux-kontext-lora/inpaint com auto-referência também para material sem referência, já que o schema aceita reference_image_url=imagem) como rota mask-anchored padrão de material/add; manter nano-banana só para fix_detail multi-imagem.
- effort: alto
- (sem verificacao adversarial)

### [P3] 11. Free fix por imagem tem corrida (read-modify-write) e flags de uso são atualizadas sem atomicidade
- files: app/api/edits/route.ts:294; lib/spaces/edit-route-helpers.ts:67
- evidence: freeFixesUsedForImage é lido em buildRoutingContext (edit-route-helpers.ts:67-81) e gravado depois do sucesso como `free_fixes_used: ctx.freeFixesUsedForImage + 1` (route.ts:294-300) — duas requisições paralelas leem 0 e ambas saem grátis; o update não é incremento atômico no banco.
- impact: Cota grátis por imagem pode ser duplicada em cliques rápidos/concorrência. Limitado pelo teto mensal (bump_monthly_usage é atômico), então perda pequena.
- recommendation: Trocar por UPDATE ... SET free_fixes_used = free_fixes_used + 1 (RPC ou .rpc com SQL) e revalidar a elegibilidade dentro da mesma transação do débito.
- effort: baixo
- (sem verificacao adversarial)

### [P3] 12. Sistema duplo morto (guard/orchestrator/router legados + tabela de custo antiga) confunde manutenção do quality gate real
- files: lib/spaces/engines/orchestrate.ts:76; lib/spaces/engines/guard-policy.ts:34; lib/spaces/engines/router.ts:38; lib/spaces/edit-economy.ts:9
- evidence: runRetouchWithGuard/evaluateGuard/selectEngine são exportados (engines/index.ts:24-47) mas nenhum route os usa (grep: únicos hits são definições/exports). edit-economy.ts:9-16 mantém EDIT_COST (hd 6 / 2k 12 / 4k 24) obsoleto vs NODE_COST do editRouter; só LARGE_MASK_THRESHOLD é consumido pela UI. object-removal.ts e flux-inpaint.ts são engines não roteados.
- impact: Dois 'quality guards' e duas tabelas de preço coexistem; risco real de um dev futuro reativar o caminho errado ou cobrar pela tabela antiga (6–24 nodes).
- recommendation: Remover (ou mover para /attic) selectEngine, orchestrate.ts, guard-policy.ts, object-removal.ts, flux-inpaint.ts e o EDIT_COST; manter apenas o gate do edit-pipeline como fonte única.
- effort: baixo
- (sem verificacao adversarial)
