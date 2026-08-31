# AREA: renderizar

## MAP
O modo Renderizar é o fluxo upload → configuração → geração em página única. A UI (app/app/generate/GenerateClient.tsx, 1277 linhas; server page em app/app/generate/page.tsx) comprime a imagem no client para no máximo 2048px no maior lado e JPEG q=0.92 (compressImage, linhas 113-137), e envia base64 para POST /api/generate (app/api/generate/route.ts). O usuário escolhe: tipo de projeto (exterior/interior), segmento, "ESPAÇO" (environment), iluminação, entorno/contexto, elementos de cena, materiais (texto livre, 8 campos interior / 5 exterior, auto-save em profiles.project_materials), nível de fidelidade (Máxima/Equilibrado/Criativo — default Máxima), motor e resolução. Motores em lib/engines.ts: Vega = fal-ai/nano-banana-pro/edit (default, 2K=20 nodes, 4K=40), Pulsar = fal-ai/nano-banana-2/edit (HD=10, 2K=15, 4K=25), Quasar = openai/gpt-image-2/edit (2K=28, 4K=56; mapeia 2K→quality 'medium', 4K→'high'). Default global: Vega+2K. Parâmetros geometryLock=85 e fidelityMode='strict' são constantes ocultas na UI (GenerateClient.tsx:219-220).

A rota /api/generate valida engine/resolução, debita via RPC consume_workspace_nodes (wrapper que resolve o dono do workspace e chama consume_nodes_v2 — plano primeiro, Lumens FIFO; migration supabase/migrations/20260609000000_office_wallet.sql), monta o prompt com buildFidelityPrompt (lib/prompts.ts:789-896), faz upload do base64 pra fal.storage e chama fal.subscribe com Promise.race de 90s (FAL_TIMEOUT_MS). Refund best-effort no catch. Persiste em renders com config_snapshot completo (para integração Spaces). É IMAGE-TO-IMAGE por instrução: os três endpoints são de edição (image_urls + prompt) — não existe strength/denoise/ControlNet; toda a fidelidade é engenharia de prompt.

O prompt tem camadas reais (lib/prompts.ts): bloco de âncora (render anterior como imagem #1 = fonte de materiais; input = geometria, linhas 722-734), refinamento cirúrgico (699-717), fidelityModifier por nível (736-753), PROJECT FACTS do briefing de visão (759-773), material overrides (621-655), intent (CGI→foto sem âncora; neutro com âncora, 854-858), lighting com lock afirmativo para "Preservar Original" (867-880), mood wrappers anti-drift para background (817-841), negativos consolidados (NEGATIVE_BASE + MAXIMUM_EXTRA_NEGATIVES, 662-694) e camera block condicional (585-593). Os níveis de fidelidade NÃO mudam parâmetros numéricos — apenas texto.

Pré-análise: existe pipeline de duas etapas construído — app/api/analyze/route.ts chama analyzeImage (lib/fidelity-engine.ts) com Gemini 2.5 Flash direto (lib/gemini.ts, timeout 20s, fallback briefing conservador), devolvendo briefing arquitetônico (geometria, volumes, pavimentos, aberturas, materiais, câmera, entorno, elementos_preservar). PORÉM, nenhum código chama /api/analyze (grep sem matches no repo) e o GenerateClient nunca envia briefing/inputUrl — no Renderizar standalone o briefing é sempre undefined e o bloco PROJECT FACTS nunca entra no prompt. O fluxo real é etapa única.

Spaces REUSA a stack: lib/spaces/dna.ts roda extractDna (DNA visual) + analyzeImage (briefing) em paralelo; app/api/spaces/[spaceId]/generate/route.ts monta buildFidelityPrompt com fidelityLevel='maximum' e briefing do DNA — ou seja, o Space usa o pipeline de duas etapas que o Renderizar standalone não usa. Divergências: Spaces usa 1 imagem (Vista Mestre), materiais derivados do DNA no campo 'elementos', pré-checagem de saldo via user_node_balance.total_balance (inclui Lumens), e verificação pós-geração verifyDna (threshold 0,85 por atributo, com regeneração sem custo) — o Renderizar não tem nenhuma verificação pós-geração. generate-from-sketches usa dual-reference [Vista Mestre, sketch] com prompt próprio (buildAnguloPrompt).

A âncora do Renderizar (default ligada após a 1ª geração) usa sempre o ÚLTIMO output como imagem #1, com o input original como #2 — bom para variações, mas materiais derivam em cadeia ao longo de N gerações.

## FINDINGS

### [P1] 1. Pipeline de pré-análise (Fidelity Engine) construído mas desconectado do Renderizar
- files: app/api/analyze/route.ts:9; app/app/generate/GenerateClient.tsx:427-447; app/api/generate/route.ts:187; lib/prompts.ts:759-773
- evidence: O comentário em app/api/analyze/route.ts:9 diz 'Roda ANTES do /api/generate quando o usuário escolhe Máxima ou Equilibrado', mas grep por 'api/analyze' no repo inteiro retorna zero callers, e o body enviado por handleGenerate (GenerateClient.tsx:430-446) não contém briefing nem inputUrl. Em app/api/generate/route.ts:187 buildFidelityPrompt recebe briefing=undefined sempre, então o bloco PROJECT FACTS (lib/prompts.ts:759-773 — pavimentos, aberturas, câmera, entorno, elementos_preservar) nunca entra no prompt do módulo mais usado. Spaces usa exatamente esse briefing (app/api/spaces/[spaceId]/generate/route.ts:314) e tem fidelidade melhor por design.
- impact: É a causa mais direta da dor relatada ('gerações recriam demais'): a camada de locks específicos por imagem — projetada exatamente para travar geometria/aberturas/câmera — está morta no fluxo principal. Também faz config_snapshot.briefing ser sempre null, custando 1 call extra de Vision quando o usuário cria Space a partir da render (lib/spaces/dna.ts:148-155).
- recommendation: Religar o fio sem mudar UX: no handleGenerate, quando fidelityLevel !== 'creative', chamar /api/analyze primeiro (já é gratuito, 20s timeout, fallback seguro) e passar { briefing, inputUrl } pro /api/generate — o route já aceita ambos (route.ts:84,101). Alternativa server-side: rodar analyzeImage dentro do próprio /api/generate antes do fal.subscribe (evita 2ª viagem do base64). Mostrar só um texto de loading extra ('Analisando projeto...') que aliás já existe em LOADING_TEXTS.
- effort: baixo
- (sem verificacao adversarial)

### [P1] 2. Gate de saldo da UI usa só plan_balance: bloqueia usuários com Lumens e membros de workspace (bolsa do dono)
- files: app/app/generate/page.tsx:23-43; app/app/generate/GenerateClient.tsx:419; app/app/generate/GenerateClient.tsx:846-850; app/api/generate/route.ts:292-301; supabase/migrations/20260609000000_office_wallet.sql:17-37
- evidence: page.tsx passa initialCredits = profiles.credits (apenas saldo do plano; a view user_node_balance define plan_balance = p.credits e lumen_balance separado — migration 20260508140000:247-249). GenerateClient.tsx:419 faz `if (credits < nodeCost) { setError('Nodes insuficientes.'); return }` e o botão é disabled na linha 850 com a mesma condição. O servidor, porém, debita via consume_workspace_nodes → consume_nodes_v2 que consome plano E Lumens FIFO, e para membro de workspace debita o saldo do DONO (office_wallet.sql:27-36). O response também devolve `credits: balance?.plan_balance` do usuário logado (route.ts:298), não do pagador.
- impact: Usuário que comprou Lumens avulsos mas zerou o plano vê 'Nodes insuficientes' e botão travado, mesmo com saldo real — perda direta de receita/uso. Membro de equipe (Fase 1.5 recém-lançada) com profiles.credits baixo fica bloqueado mesmo com a bolsa do escritório cheia, quebrando a feature de workspaces no módulo principal.
- recommendation: No page.tsx, ler user_node_balance.total_balance do PAGADOR (resolver dono do workspace ativo, ou criar view/RPC 'effective_balance'); na UI, gatear por totalBalance; no response do /api/generate, devolver o saldo do pagador (a rota já recebe debit.plan_balance_after do RPC). Manter `credits` legado mas usar totalBalance no disable do botão.
- effort: medio
- VERIFICADO: isReal=True conf=alta - CONFIRMADO com os meus próprios olhos, sem mitigação em nenhuma camada.

Evidência verificada:
- app/app/generate/page.tsx:23-27 seleciona apenas `profiles.credits` e linha 43 passa `initialCredits={profile.credits}` (só saldo do plano, do usuário logado).
- app/app/generate/GenerateClient.tsx:199 inicializa `credits` desse prop; linha 419 `if (credits < nodeCost) { setError('Nodes insuficientes.'); return }` aborta antes do fetch; linhas 846-850 desabilitam o botão com a mesma condição. Não há NENHUMA consulta a `user_node_balance`/`total_balance`/lumens no client (grep em app/app/generate retornou zero matches).
- supabase/migrations/20260508140000_pricing_v2_1_office_lumen.sql:245-256 define a view `user_node_balance` (plan_balance = p.credits; lumen_balance e total_balance separados) e linhas 112-117/119-166 mostram que `consume_nodes_v2` valida (plano+lumens) e debita plano primeiro, depois Lumens FIFO — ou seja, o servidor aceitaria a geração que o client bloqueia.
- supabase/migrations/20260609000000_office_wallet.sql:17-37: `consume_workspace_nodes` resolve o pagador como o DONO do workspace ativo (linhas 27-33) — membro gasta da bolsa do dono, mas o gate da UI olha o saldo pessoal do membro.
- app/api/generate/route.ts:142 debita via `consume_workspace_nodes`; route.ts:286-301 devolve `credits: balance?.plan_balance` consultando `user_node_balance` do usuário logado (não do pagador) — para usuário individual com Lumens, após uma geração o client seta credits=plan_balance (possivelmente 0) e re-trava o botão mesmo com Lumens sobrando.

Mitigação buscada e NÃO encontrada: nenhum refresh de saldo no client, nenhum endpoint de saldo de workspace consumido pelo GenerateClient, nenhum sync de credits de membro nas migrations de workspace (20260608000000-…000005). O bloqueio é puramente client-side, mas como guard + botão disabled, impede 100% o fluxo normal da UI.

Evidência ADICIONAL que reforça: as páginas de apresentar (prancha/page.tsx:14-36, planta-humanizada/page.tsx:32, moodboard/page.tsx:36, isometricas/page.tsx:31) JÁ corrigiram isso — consultam `user_node_balance` e usam plan+lumen como initialCredits — provando que o padrão correto existe no codebase mas não foi aplicado a generate. O mesmo bug existe em app/app/upscale/page.tsx:21 e app/app/video/page.tsx:16 (ambos passam `profile?.credits ?? 0`), ampliando o escopo além do alegado.

Correção de detalhe no cenário de workspace: o membro só fica travado quando o SALDO PESSOAL dele (profiles.credits) está abaixo de nodeCost (ex.: usuário que gastou os 40 nodes grátis antes de entrar na equipe). Como o dono paga, o credits pessoal do membro nunca decresce via geração — então membro recém-criado com 40 nodes não trava de imediato, mas o número exibido (GenerateClient.tsx:597) é o saldo pessoal, não a bolsa do escritório, ou seja, o display também está errado para membros.

Severidade: P1 é justa. Bloqueia geração (módulo principal) para clientes pagantes de Lumens (packs 500/1500/4000 vendidos via Stripe — add_lumen_pack em 20260508140000:183-231) e quebra a proposta central da Fase 1.5 de workspaces para membros convertidos de contas individuais zeradas.

### [P2] 3. Fidelidade 100% dependente de prompt, sem verificação pós-geração nem re-roll grátis no Renderizar
- files: app/api/generate/route.ts:213-231; lib/engines.ts:22-50; lib/spaces/dna.ts:274-329; app/api/vistas/[vistaId]/verify-dna/route.ts
- evidence: Os três motores são endpoints de edição por instrução (image_urls + prompt; falParamsForEngine só envia resolution/quality/num_images/output_format — route.ts:35-51). Não existe strength, denoise, guidance ou conditioning estrutural em nenhum lugar; FIDELITY_LEVELS só trocam texto de prompt (lib/prompts.ts:736-753). O drift-check verifyDna (lib/spaces/dna.ts:274) com threshold 0,85 e regeneração sem custo existe SÓ em Spaces (app/api/vistas/[vistaId]/verify-dna/route.ts); /api/generate retorna o output sem nenhuma checagem.
- impact: Quando o modelo desobedece o prompt (inevitável numa fração das gerações), o usuário paga 10-56 nodes por um render que 'recriou demais' e a plataforma nem detecta. A dor nº 1 do produto não tem telemetria nem mitigação automática no módulo principal.
- recommendation: Sem mudar UX: (1) pós-geração, rodar um drift-check barato estilo verifyDna comparando output vs input (geometria/materiais) e, abaixo do threshold, oferecer 1 regeneração gratuita automática (política já existe em Editar — lib/spaces/edit-free-fix.ts); (2) logar o score em renders para medir drift por engine/nível e calibrar prompts com dados reais; (3) avaliar expor na FAL algum parâmetro de aderência do nano-banana-pro/edit (conferir doc oficial — não assumir que existe).
- effort: medio
- (sem verificacao adversarial)

### [P2] 4. Prompt de Máxima sem âncora assume que o input é 'raw 3D/CAD/SketchUp' mesmo quando é foto real
- files: lib/prompts.ts:854-858; lib/prompts.ts:871-877; lib/prompts.ts:585-593
- evidence: Em maximum sem âncora o intent é fixo: 'This reference is a raw 3D / CAD / SketchUp model. Re-render it into a real photograph...' (prompts.ts:857) e a lightingLine manda 'replace the flat uniform CAD/3D shading with realistic photographic lighting' (prompts.ts:877). A UI aceita qualquer imagem ('SketchUp · Render · 3D · JPG · PNG' — GenerateClient.tsx:896) e o fidelity-engine até classifica 'fotos de obra' (lib/fidelity-engine.ts:18-19), mas como a análise não roda no standalone, nada adapta o intent ao tipo de input.
- impact: Para foto de obra/ambiente real (caso comum: arquiteto quer melhorar foto ou trocar material), a primeira geração recebe a premissa errada — ordem ativa de reinterpretar shading 'de CAD' que não existe, gatilho clássico do drift de materiais/iluminação que o próprio código documenta ter combatido no caso com âncora (comentário em prompts.ts:566-581).
- recommendation: Detectar o tipo de input e ramificar o intent: ao religar a pré-análise (finding 1), adicionar um campo `tipo_input: 'cgi' | 'foto' | 'sketch'` ao briefing (1 linha no USER_PROMPT do fidelity-engine) e usar o bloco neutro de buildCameraBlock/intent (o mesmo do caso com âncora) quando for foto. Zero mudança de UX.
- effort: medio
- (sem verificacao adversarial)

### [P2] 5. Input degradado a 2048px + recompressão JPEG para qualquer resolução de saída, inclusive 4K
- files: app/app/generate/GenerateClient.tsx:113-137; app/app/generate/GenerateClient.tsx:379
- evidence: compressImage(sourceUrl, 2048, 0.92) é aplicado a todo upload (GenerateClient.tsx:379): maior lado limitado a 2048px e re-encode JPEG q=0.92 mesmo quando o usuário sobe PNG de linhas finas do SketchUp e vai gerar em 4K (40 nodes na Vega). A única referência de geometria que o modelo recebe é essa versão reduzida.
- impact: Perda de sinal geométrico fino (esquadrias, brises, ripados) exatamente no caso mais caro (4K): o modelo 'chuta' detalhes que não consegue ler no input de 2048px, contribuindo para a percepção de recriação. Artefatos JPEG em linework também viram textura falsa.
- recommendation: Escalar o cap pelo destino: 2048px para HD/2K, 3072-4096px para 4K — mas via upload direto client→fal.storage (a rota já aceita inputUrl pronto, route.ts:196-198) para não estourar o limite de ~4,5MB do body na Vercel. Manter PNG quando o original for PNG com linhas (heurística simples por type do arquivo).
- effort: medio
- (sem verificacao adversarial)

### [P2] 6. Timeout de 90s refunda mas não cancela o job FAL; função sem maxDuration pode morrer antes do refund
- files: app/api/generate/route.ts:221-226; app/api/generate/route.ts:306-319; vercel.json:1-10
- evidence: Promise.race em route.ts:221-226 rejeita após 90s mas não cancela o fal.subscribe — se a FAL completar depois, a plataforma paga a geração, o usuário já foi refundado e a imagem fica órfã (nunca persistida). Além disso não há `export const maxDuration` na rota nem `functions` no vercel.json — se o limite default do runtime na Vercel for inferior ao caminho upload+90s+insert, a função é morta no meio e o catch com refund (route.ts:308-318) nunca roda: débito sem entrega e sem refund.
- impact: Custo FAL sem receita no caso timeout-mas-completou; e, pior, cobrança sem entrega nem refund se a função for terminada pelo runtime antes do catch — perda financeira do usuário e ticket de suporte. Frequência maior em 4K (gerações longas).
- recommendation: Definir explicitamente maxDuration da rota (>= 120s) e conferir o limite do plano Vercel atual; usar fal.queue.submit + polling (ou abort) em vez de subscribe com race, para poder cancelar/recuperar o job; se o output chegar pós-timeout, persistir a render mesmo assim em vez de descartar.
- effort: medio
- (sem verificacao adversarial)

### [P2] 7. Controle 'ESPAÇO' (environment) não afeta o prompt — buildFidelityPrompt ignora; ENV_EN é dead code
- files: lib/prompts.ts:794; lib/prompts.ts:255-392; lib/prompts.ts:900-946; app/app/generate/GenerateClient.tsx:634-638
- evidence: buildFidelityPrompt destrutura options sem `environment` (prompts.ts:794) e nunca consulta ENV_EN; o único consumidor de ENV_EN é buildGenerationPrompt (prompts.ts:900), que não tem nenhum caller no app (grep: só a definição). A rota sempre usa buildFidelityPrompt (route.ts:187). O Spaces até documenta isso: `environment: ''  // não usado em buildFidelityPrompt` (app/api/spaces/[spaceId]/generate/route.ts:301). Na UI, 'ESPAÇO' é uma seção de primeira classe com dezenas de opções (GenerateClient.tsx:634-638).
- impact: Usuário escolhe 'Cozinha Gourmet' vs 'Banheiro' acreditando que direciona a geração — não muda um caractere do prompt (só a coluna `ambient` do histórico). Em Criativo/Equilibrado, onde reinterpretação é desejada, a expectativa quebrada vira frustração e percepção de produto 'que não obedece'. ~140 descrições ENV_EN são peso morto.
- recommendation: Decidir o contrato: (a) injetar envDesc no prompt apenas em balanced/creative (onde não conflita com preservação), ou (b) rebaixar 'ESPAÇO' a metadado de organização/histórico com microcopy honesta. Remover buildGenerationPrompt/buildFidelityBlock/buildNegativePrompt mortos junto.
- effort: medio
- (sem verificacao adversarial)

### [P2] 8. Botão 'Melhorar qualidade (2K / 4K)' sempre regenera em 2K, cobra geração cheia e pode rebaixar 4K
- files: app/app/generate/GenerateClient.tsx:1003-1005; app/app/generate/GenerateClient.tsx:417-419; app/app/generate/GenerateClient.tsx:442
- evidence: onClick={() => handleGenerate('2k')} (GenerateClient.tsx:1003) — o override é hardcoded '2k' apesar do rótulo prometer '2K / 4K', e o botão aparece para qualquer resolução atual (inclusive quem já gerou em 4K, que pagaria por um downgrade). O guard de saldo usa nodeCost da resolução SELECIONADA (linha 419: `credits < nodeCost`), não a do override enviado na linha 442 — em Pulsar HD (10 nodes) com 12 de saldo, a UI deixa passar e o servidor cobra 15.
- impact: Cobrança percebida como errada (cliquei 'melhorar', recebi 2K de novo / regeneração nova não-determinística em vez de upscale do render que aprovei) e erro 402 tardio no edge case de saldo. Mina confiança no sistema de nodes.
- recommendation: Trocar o CTA por fluxo real de upgrade: se resolução atual < 4K, oferecer re-render na PRÓXIMA resolução do engine (ou apontar pro módulo Upscale para preservar o resultado aprovado); esconder o botão em 4K; calcular o guard de saldo com o custo do override.
- effort: baixo
- (sem verificacao adversarial)

### [P3] 9. Âncora encadeada: materiais derivam composta ao longo de variações sucessivas
- files: app/app/generate/GenerateClient.tsx:425; app/app/generate/GenerateClient.tsx:450; app/api/generate/route.ts:209-211
- evidence: anchorUrl = useAnchor && outputUrl ? outputUrl : undefined (GenerateClient.tsx:425) e setOutputUrl(data.outputUrl) na linha 450: a âncora é sempre o ÚLTIMO output, então a geração N+1 herda materiais da N (que já podem ter driftado da original), nunca da primeira versão aprovada. O prompt declara a âncora como fonte exata de materiais (lib/prompts.ts:725-733).
- impact: Em sessões de iteração (caso de uso central: trocar iluminação 3-4 vezes), o erro de material acumula como 'telefone sem fio' — a 4ª variação pode estar visivelmente longe do projeto original, reforçando a dor de perda de fidelidade.
- recommendation: Ancorar na primeira geração da sessão (ou na última explicitamente 'aprovada' pelo usuário via download/ação), em vez do último output; alternativa simples: guardar firstOutputUrl e usar como âncora fixa enquanto o input não muda.
- effort: baixo
- (sem verificacao adversarial)

### [P3] 10. Re-upload do mesmo base64 a cada variação apesar do suporte a inputUrl na API
- files: app/api/generate/route.ts:196-205; app/app/generate/GenerateClient.tsx:430-446
- evidence: A rota implementa reuso ('if (providedInputUrl) { inputUrl = providedInputUrl ... reused' — route.ts:196-198) e devolve originalUrl no response (route.ts:295), mas o client nunca envia inputUrl: cada 'gerar variação' re-envia o mesmo imageBase64 (~1-2MB) e re-faz fal.storage.upload (route.ts:203).
- impact: Latência e payload desnecessários em toda regeneração (o fluxo de iteração é o coração do módulo); banda da Vercel e da fal.storage gastas à toa.
- recommendation: Guardar data.originalUrl no state após a 1ª geração e enviá-lo como inputUrl nas seguintes (limpar ao trocar de imagem em handleNewRender/loadImage).
- effort: baixo
- (sem verificacao adversarial)

### [P3] 11. Parâmetros mortos geometryLock/fidelityMode trafegam e persistem sem efeito
- files: app/app/generate/GenerateClient.tsx:219-220; app/api/generate/route.ts:78-82; lib/prompts.ts:600-610; app/api/generate/route.ts:243-255
- evidence: geometryLock=85 e fidelityMode='strict' são constantes na UI (GenerateClient.tsx:219-220), enviadas no body, validadas e gravadas no config_snapshot (route.ts:243-255), mas buildFidelityPrompt nunca os lê — buildFidelityBlock (prompts.ts:600) só é chamado pelo buildGenerationPrompt sem callers. O comentário da rota ainda referencia 'consume_nodes_v2' (route.ts:147) embora chame consume_workspace_nodes.
- impact: Ruído de manutenção: futuro dev pode 'ajustar' geometryLock esperando efeito; snapshot carrega campos enganosos que o Spaces lê como ground truth (lib/spaces/dna.ts:131-141).
- recommendation: Remover geometryLock/fidelityMode do body e do snapshot (ou documentar como legado), deletar buildGenerationPrompt/buildFidelityBlock/buildNegativePrompt e corrigir comentários — junto com a limpeza do finding do ENV_EN.
- effort: baixo
- (sem verificacao adversarial)
