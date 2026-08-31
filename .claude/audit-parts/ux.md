# AREA: ux

## MAP
A superfície de UX do Spacenode se divide em: landing pública (app/page.tsx montando Navbar, Hero, ValueProps, Demo, PlatformModules, HowItWorks, ProductMockup, ComparisonTable, Gallery, PricingToggle, FAQ, FinalCTA, Footer e MobileCTA), auth (app/login/page.tsx, forgot/update-password), e o app autenticado sob app/app/* com shell fixo (app/app/layout.tsx: flex 100vh + Sidebar de components/app/Sidebar.tsx, que expande de 72px para 264px apenas por hover do mouse).

A landing é genuinamente mobile-first: todos os componentes têm media queries (21 ocorrências em components/), hambúrguer com drawer (Navbar.tsx:110-268), CTA fixo inferior pós-scroll (landing/MobileCTA.tsx) e trust line "40 nodes grátis · sem cartão". Pricing na landing mostra nodes/mês, preço BRL, breakdown de renders por resolução e tabela de consumo por engine (PricingToggle.tsx:22-43, 203+).

Módulos: Renderizar (app/app/generate/GenerateClient.tsx, 1278 linhas, grid inline 480px+1fr sem breakpoints) com pills de tipo/segmento/espaço/iluminação, materiais com auto-save, fidelidade, motor de IA mascarado (Vega/Pulsar/Quasar via lib/engines.ts — nano-banana-pro, nano-banana-2, gpt-image-2; custos 10–56 nodes por imagem), custo exibido no botão ("X Nodes por render"), comparador antes/depois com zoom/pan (mouse-only) e CTA pós-render "Criar Space". Editar (app/app/editar → components/spaces/RetocarStandaloneFlow.tsx, 1801 linhas) é o fluxo mais maduro: preview de rota/custo server-side antes de gerar (/api/edits/preview, debounce 350ms), quality gate que comunica "Nenhum node foi consumido", confirmação de superfície segmentada com custo recalculado, referências, versões em sessão e comparador por pointer events (funciona em touch); canvas de máscara usa Pointer Events + touchAction:none (RetocarCanvas.tsx:427-445). Ampliar (app/app/upscale/UpscaleClient.tsx) tem labels amigáveis ("Alta Fidelidade", "Limpar Ruído"), objetivos-preset, recomendação automática que chega na UI (lib/upscale/recommendations.ts — mas baseada só em nome/tamanho do arquivo), custo+saldo no rodapé e BeforeAfter. Animar (app/app/video/*) mostra custo via CostSummary, timeline de geração com estimativa "1 a 4 minutos" e modelos com nomes mascarados ("Rápido/Cinemático/Arquitetônico") porém com tag técnica crua ("Kling 2.5 Turbo Pro", "Veo 3.1", "Seedance 2.0") visível no card. Histórico (HistoryClient.tsx) com pastas, seleção em lote, porém usa alert/confirm/prompt nativos. Billing (BillingClient.tsx) força tema claro #f2f2f2 num app todo escuro e vende planos + Lumens (lib/lumens.ts: 500/R$89, 1500/R$219, 4000/R$499, 90 dias).

Pontos sistêmicos encontrados: (1) o saldo é lido de fontes diferentes por tela — profiles.credits no Renderizar e Ampliar (generate/page.tsx:23-27, upscale/page.tsx:15-21), user_node_balance.total_balance no Editar, e plan_balance+lumen_balance do PAGADOR do workspace na sidebar (app/app/layout.tsx:25-44); (2) o botão "+ comprar Nodes" do Renderizar chama /api/stripe/checkout sem body, que exige {type:'plan'|'lumen'} e devolve 400 — botão silenciosamente morto; (3) compra avulsa tem dois caminhos dead-end ("Disponível em agosto" via stub /api/billing/avulso-checkout) convivendo com a venda real de Lumens em /app/billing; (4) refund automático em falha de geração existe no servidor (api/generate/route.ts:308-318) mas nunca é comunicado ao usuário; (5) chips de qualidade do dashboard/histórico usam tabela de custos antiga (4/8/20 nodes), divergente de lib/engines.ts. O app autenticado inteiro não tem adaptação mobile (zero media queries em GenerateClient/UpscaleClient/AnimateClient/Sidebar), em contraste direto com a landing que capta tráfego mobile do Instagram.

## FINDINGS

### [P0] 1. Botão '+ comprar Nodes' do Renderizar está morto (POST sem body → 400 silencioso)
- files: app/app/generate/GenerateClient.tsx:535-539; app/app/generate/GenerateClient.tsx:599; app/api/stripe/checkout/route.ts:32-41
- evidence: GenerateClient.tsx:536 faz `fetch('/api/stripe/checkout', { method: 'POST' })` sem body nem headers; o endpoint exige JSON com `type: 'plan'|'lumen'` (checkout/route.ts:34-41 retorna 400 'Payload inválido' / 'type inválido'). Como o handler só age `if (data.url)`, o clique não produz nada — sem erro, sem redirect.
- impact: É o CTA de compra no exato momento de maior intenção (usuário sem nodes na tela de geração). Clique sem qualquer resposta = receita perdida e percepção de produto quebrado. Mesma chamada quebrada está no momento 'Nodes insuficientes'.
- recommendation: Trocar por link/CTA para /app/billing (ou enviar payload válido abrindo um seletor de plano/pack). Adicionar estado de erro visível se o checkout falhar. Smoke-testar todos os CTAs que chamam /api/stripe/checkout.
- effort: baixo
- (sem verificacao adversarial)

### [P0] 2. App autenticado inutilizável em mobile — fluxo signup→primeira geração quebra após a landing mobile-first
- files: app/app/generate/GenerateClient.tsx:1203; app/app/upscale/UpscaleClient.tsx:376; app/app/video/AnimateClient.tsx:116-123; components/app/Sidebar.tsx:190-205; app/app/layout.tsx:47; app/app/generate/GenerateClient.tsx:462-475
- evidence: GenerateClient usa grid inline `gridTemplateColumns:'480px 1fr'` (S.main, linha 1203) sem nenhuma media query; com viewport ~390px e sidebar de 72px, a coluna de controles (480px) não cabe e `overflow:'hidden'` do layout (layout.tsx:47) corta o resto. UpscaleClient fixa `width: 420` no painel esquerdo (linha 376). A Sidebar expande apenas com onMouseEnter (Sidebar.tsx:204) — em touch não há hover: fica só ícones, sem labels e sem menu alternativo. O slider antes/depois do Renderizar usa apenas mousedown/mousemove (linhas 462-475, 913-947), inoperante em touch.
- impact: O tráfego pago vem do Instagram (mobile). A landing converte em mobile, mas o produto pós-login é desktop-only: primeira geração impossível no celular → desperdício direto de mídia paga e churn no onboarding. Ações do dashboard reveladas só por :hover (globals.css:470-489) agravam.
- recommendation: Definir breakpoint (<900px): empilhar controles acima/abaixo do preview (como já feito em .spn-editar-grid, globals.css:188-197), converter sidebar em bottom-nav ou drawer com botão, e migrar o slider de comparação para Pointer Events (o BeforeAfterSlider do Editar já faz isso — reutilizar). No mínimo, exibir um estado 'continue no desktop' digno em vez de layout cortado.
- effort: alto
- (sem verificacao adversarial)

### [P1] 3. Saldo de nodes lido de 3 fontes diferentes conforme a tela — gating e contadores inconsistentes
- files: app/app/generate/page.tsx:23-27; app/app/upscale/page.tsx:15-21; app/app/editar/page.tsx:12-16; app/app/layout.tsx:25-44; app/api/generate/route.ts:292-302; app/app/generate/GenerateClient.tsx:419
- evidence: Renderizar e Ampliar hidratam o saldo de `profiles.credits`; Editar usa `user_node_balance.total_balance`; a sidebar usa `plan_balance+lumen_balance` do PAGADOR do workspace (getPayerId). O débito real é `consume_workspace_nodes` (generate/route.ts:142). O client bloqueia com `if (credits < nodeCost)` → 'Nodes insuficientes.' (GenerateClient.tsx:419) usando profiles.credits, e após gerar `setCredits(data.credits)` recebe só `plan_balance` (route.ts:298), ignorando Lumens.
- impact: Usuário com Lumens (ou membro de workspace com bolsa do dono) pode ver contadores divergentes entre sidebar e tela de geração, ser bloqueado no client tendo saldo real, ou ver o contador 'cair' mais do que o cobrado. Mina a confiança no sistema de cobrança — crítico num produto de créditos pré-pagos.
- recommendation: Padronizar uma única fonte (user_node_balance do pagador, como a sidebar) em todas as telas de criação; retornar e exibir `totalBalance` pós-geração; remover o gating client-side por profiles.credits e confiar no 402 do servidor com mensagem rica.
- effort: medio
- (sem verificacao adversarial)

### [P1] 4. Compra avulsa: dois CTAs dead-end ('Disponível em agosto') convivem com a venda real de Lumens no billing
- files: components/app/AvatarComConsumo.tsx:314-325; components/spaces/InsufficientBalancePanel.tsx:33-46; components/spaces/InsufficientBalancePanel.tsx:127-143; app/api/billing/avulso-checkout/route.ts:10-18; app/app/billing/BillingClient.tsx:145-208
- evidence: O popover de saldo da sidebar tem botão 'Comprar avulso' → `alert('Disponível em agosto.')` (AvatarComConsumo.tsx:316). O painel de saldo insuficiente do Spaces destaca 'Pacote avulso — Recomendado — Comprar pacote · R$ 89', mas o endpoint /api/billing/avulso-checkout é um stub que sempre retorna 'available_in_august' → `alert(...)` (InsufficientBalancePanel.tsx:39). Enquanto isso, BillingClient.tsx:145-208 já vende os mesmos Lumens via Stripe para planos Pro+.
- impact: No momento de intenção de compra, o usuário recebe um alert nativo dizendo que o recurso não existe — sendo que existe em outra tela. 'Agosto' também é referência temporal ambígua/datada (hoje é junho/2026). Conversão perdida + sensação de produto inacabado.
- recommendation: Apontar ambos os CTAs para /app/billing (ou abrir o checkout real de Lumen via /api/stripe/checkout {type:'lumen'}); para free/starter, mostrar o upgrade necessário em vez do stub. Remover o endpoint stub e os alerts.
- effort: baixo
- (sem verificacao adversarial)

### [P1] 5. Falha na geração não comunica que os nodes foram devolvidos
- files: app/api/generate/route.ts:306-330; app/app/generate/GenerateClient.tsx:454-456; app/app/generate/GenerateClient.tsx:798
- evidence: O servidor faz refund best-effort pós-débito (route.ts:308-318), mas a resposta de erro é apenas 'Erro ao gerar render. Tente novamente.' (route.ts:325). O client exibe a string crua no errorBox (GenerateClient.tsx:798) sem mencionar cobrança/estorno, e não atualiza o saldo exibido.
- impact: Após esperar ~40s e ver erro, a primeira dúvida do usuário é 'perdi meus nodes?'. Sem resposta, vira ticket de suporte ou churn. O Editar já resolve isso bem ('Nenhum node foi consumido', RetocarStandaloneFlow.tsx:958) — o módulo principal não.
- recommendation: Incluir no payload de erro `refunded: true/nodes` e exibir: 'Não foi possível gerar. Seus X nodes foram devolvidos — tente novamente sem custo adicional.' Replicar no Upscale e Vídeo.
- effort: baixo
- (sem verificacao adversarial)

### [P1] 6. Comparador do Upscale degrada artificialmente o 'antes' e realça o 'depois'
- files: components/app/BeforeAfter.tsx:46; components/app/BeforeAfter.tsx:57; components/app/BeforeAfter.tsx:31
- evidence: A imagem 'antes' recebe `filter: 'contrast(0.9) saturate(0.9) brightness(0.95) blur(0.4px)'` (linha 46) e a 'depois' recebe `contrast(1.05) saturate(1.05)` (linha 57) — o comentário no código admite: 'visually softened to read as raw' / 'crisp and premium'. Além disso o container fixa `aspect-[4/3]` com `object-cover`, cortando imagens de outras proporções.
- impact: O comparador é a prova de valor de uma feature paga (até 56+ nodes). Falsear a comparação é enganoso; arquitetos comparam com o arquivo original baixado e percebem. Risco direto de confiança/reembolso. O corte por object-cover ainda esconde bordas — justamente onde upscale mostra ganho.
- recommendation: Remover os filters de ambas as imagens e usar object-contain (como o BeforeAfterSlider do Editar, RetocarStandaloneFlow.tsx:1609-1614). O ganho real de upscale aparece com zoom — adicionar zoom/lupa se quiser reforçar o efeito honestamente.
- effort: baixo
- (sem verificacao adversarial)

### [P2] 7. Jargão de modelos vaza na UI: 'Clarity (upscale)', 'Flux Fill (retoque)' e tags 'Kling 2.5 Turbo Pro'/'Veo 3.1'/'Seedance 2.0'
- files: components/spaces/VistaDetail.tsx:215-219; app/app/video/_components/VideoModelSelector.tsx:135-140; lib/video/models.ts:76-167
- evidence: VistaDetail.tsx:215-218 renderiza literalmente `'Clarity (upscale)'` e `'Flux Fill (retoque)'` no metadado da vista (o helper amigável engineDisplayName das linhas 17-22 existe mas não é usado nesse bloco). No Animar, cada card de modelo mostra `{model.tag}` (VideoModelSelector.tsx:139) com valores 'Kling 2.5 Turbo Pro', 'Veo 3.1', 'Seedance 2.0', 'Google Flow', 'Gemini Omni' (models.ts:77,96,116,146,166).
- impact: Quebra a estratégia de marca (engines mascaradas como Vega/Pulsar/Quasar) e expõe fornecedores — facilita comparação de preço por leigos e soa técnico para o público arquiteto. Inconsistência: Renderizar esconde, Animar expõe.
- recommendation: Em VistaDetail, usar o helper engineDisplayName já existente. No Animar, remover a tag técnica do card (manter só 'Rápido/Cinemático/Arquitetônico' + descrição) ou substituí-la por atributo de benefício ('movimento suave', 'máxima fidelidade').
- effort: baixo
- (sem verificacao adversarial)

### [P2] 8. Chips de qualidade/engine do dashboard e histórico usam tabela de custos antiga — rotulam errado o que o usuário comprou
- files: app/app/page.tsx:38-43; app/app/history/HistoryClient.tsx:49-61; lib/engines.ts:22-49
- evidence: `quality(nodes)` mapeia 4→HD, 8→2K, 20→4K (page.tsx:38-43 e HistoryClient.tsx:49-54), mas a tabela vigente é Pulsar hd:10/2k:15/4k:25, Vega 2k:20/4k:40, Quasar 2k:28/4k:56 (lib/engines.ts). Um render Vega 2K (20 nodes) ganha chip '4K'; os demais custos não geram chip. `engineLabel` (HistoryClient.tsx:58) faz `model.includes('nano-banana')` → 'Vega', o que rotula renders Pulsar (nano-banana-2) como 'Vega', e não tem caso para Pulsar.
- impact: Usuário vê metadado errado sobre a resolução/engine que pagou (ex.: acha que tem 4K quando é 2K e exporta para impressão). Corrói confiança no histórico e gera suporte.
- recommendation: Persistir engine+resolução no registro do render (ou derivar de `model` com mapeamento completo incluindo nano-banana-2→Pulsar) e remover a inferência por custo. Centralizar o label em lib/render-display.
- effort: medio
- (sem verificacao adversarial)

### [P2] 9. Diálogos nativos alert/confirm/prompt em telas core (Histórico, Vistas, Pack)
- files: app/app/history/HistoryClient.tsx:123-304; components/spaces/VistaDetail.tsx:105; components/spaces/VistaDetail.tsx:258; components/spaces/PackEditor.tsx:113
- evidence: HistoryClient usa `alert('Falha ao carregar')` (123,130), `window.confirm('Excluir N renders?...')` (224), `window.prompt('Nome da pasta:')` (271) e mais 4 alerts. VistaDetail usa `confirm('Descartar esta vista?...')` (105) e `alert('Em breve.')` no botão '+ Pack' (258).
- impact: Diálogos do sistema quebram completamente a estética premium construída no resto do app (modais custom existem, ex. segConfirm do Editar), não seguem dark theme, e em mobile são ainda mais grosseiros. Criar pasta via prompt() impede validação/UX decente.
- recommendation: Criar um componente de modal de confirmação/toast reutilizável (o padrão visual já existe no modal de superfície do Editar, RetocarStandaloneFlow.tsx:696-732) e substituir todas as 14 ocorrências. Remover botões que só disparam 'Em breve.' ou marcá-los visualmente como futuros.
- effort: medio
- (sem verificacao adversarial)

### [P2] 10. 'Análise' do Upscale é heurística de nome/tamanho de arquivo apresentada como análise da imagem
- files: lib/upscale/recommendations.ts:69-91; app/app/upscale/UpscaleClient.tsx:260-269; app/app/upscale/UpscaleClient.tsx:493-516
- evidence: A UI promete 'Envie uma imagem para a SpaceNode analisar e sugerir o melhor caminho' (UpscaleClient.tsx:501) e mostra spinner 'Analisando imagem...' por um setTimeout fixo de 400ms (linhas 261-269). analyzeFile só checa keywords no filename ('whatsapp', 'low', 'antig'...) e fileSize < 200KB (recommendations.ts:72-85) — nunca olha pixels/dimensões, embora a UI já capture naturalWidth/Height.
- impact: Recomendação errada em casos triviais (arquivo renomeado, PNG grande mas borrado) sob aparência de inteligência — o tipo de promessa quebrada que usuário premium percebe. As justificativas exibidas ('Nome do arquivo sugere...') já entregam a fragilidade.
- recommendation: Incluir sinais reais já disponíveis (megapixels via imageDimensions, bytes-por-pixel como proxy de compressão) na heurística, ou suavizar a copy para 'sugestão inicial — ajuste se necessário'. Remover o delay artificial de 400ms.
- effort: baixo
- (sem verificacao adversarial)

### [P2] 11. Renderizar: nenhuma orientação pré-upload (ângulo, qualidade, o que enviar) nem recomendação pós-upload
- files: app/app/generate/GenerateClient.tsx:881-903; app/app/generate/GenerateClient.tsx:894-896
- evidence: O empty state do upload diz apenas 'arraste sua imagem aqui' / 'SketchUp · Render · 3D · JPG · PNG · até 10 MB' (GenerateClient.tsx:895-896). Após o upload, nada analisa a imagem nem sugere engine/resolução/tipo — diferente do Upscale (banner de recomendação) e do Animar (análise automática + 'Sugerido com base na imagem').
- impact: É a primeira tela do trial (40 nodes). Usuário leigo sobe foto escura/torta/baixa-resolução, queima nodes grátis num resultado ruim e atribui a culpa ao produto — pior momento possível para decepcionar. Também não há preview/confirmação de custo além do texto no botão.
- recommendation: Pré-upload: 2-3 dicas no empty state ('melhor com vista única do ambiente, imagem nítida, enquadramento reto'). Pós-upload: detectar interior/exterior e resolução de entrada para sugerir tipo de projeto e qualidade (reaproveitar o padrão de banner verde 'Recomendado' do Upscale).
- effort: medio
- (sem verificacao adversarial)

### [P2] 12. Tema visual inconsistente entre telas: Billing claro forçado, Upscale/Animar escuro hardcoded, tema light é código morto
- files: app/app/billing/BillingClient.tsx:62-65; app/app/upscale/UpscaleClient.tsx:369; app/app/video/AnimateClient.tsx:121; app/layout.tsx:64; app/globals.css:24-40
- evidence: BillingClient fixa `background: '#f2f2f2'` e cores #1a1a1a (62-65) num app inteiro escuro; UpscaleClient e AnimateClient fixam `background: '#0a0a0a', color: '#ffffff'` ignorando as CSS vars (UpscaleClient.tsx:369, AnimateClient.tsx:121). O boot script lê localStorage 'theme'==='light' (app/layout.tsx:64) e globals.css define html.light, mas nenhum componente grava esse valor — não existe toggle.
- impact: Navegar Renderizar (escuro) → Planos (claro) → Ampliar (escuro) dá impressão de telas de produtos diferentes — exatamente o oposto de 'premium coeso'. Se o tema light um dia for ativado, Upscale/Animar/Sidebar quebram por cores hardcoded.
- recommendation: Converter Billing, Upscale e Animar para as CSS vars (--color-bg etc.). Decidir o destino do tema light: ou expor o toggle em /app/settings, ou remover o boot script e a classe.
- effort: medio
- (sem verificacao adversarial)

### [P2] 13. Vídeo: requisição única de 1–4 min com 'Mantenha esta aba aberta' — sem recuperação se a aba cair
- files: app/app/video/_hooks/useVideoGeneration.ts:44; app/app/video/_components/VideoGenerationTimeline.tsx:110
- evidence: A geração é um único `fetch('/api/video', { method: 'POST', body })` (useVideoGeneration.ts:44) sem job id/polling; a própria UI avisa 'Vídeos de arquitetura levam entre 1 e 4 minutos. Mantenha esta aba aberta.' (VideoGenerationTimeline.tsx:110).
- impact: É a geração mais cara do produto. Em mobile (aba suspensa pelo SO) ou queda de rede, o usuário paga os nodes e perde a resposta — o vídeo até aparece depois no histórico, mas nada comunica isso, então parece cobrança sem entrega.
- recommendation: Curto prazo: adicionar microcopy 'se a conexão cair, o vídeo continua sendo gerado e aparece no Histórico'. Médio prazo: criar job assíncrono com polling/refresh do carrossel de histórico, removendo a dependência da aba aberta.
- effort: alto
- (sem verificacao adversarial)

### [P2] 14. Microcopy técnico em momentos de resultado: 'pixels fora da máscara', '% de área mascarada', 'Upscale 2K' vs 'Ampliar'
- files: components/spaces/RetocarStandaloneFlow.tsx:1516-1524; components/spaces/RetocarStandaloneFlow.tsx:894-896; components/spaces/VistaDetail.tsx:241-243; app/app/billing/BillingClient.tsx:147
- evidence: Aviso de drift: 'O motor alterou X% dos pixels fora da máscara (acima do limite recomendado de 2%). Considere refazer ou ajustar a máscara.' (RetocarStandaloneFlow.tsx:1522-1524). Hint 'Área mascarada: 12.3%' (linha 896). VistaDetail usa o anglicismo 'Upscale 2K · 8 nodes' / 'Aplicando upscale…' (241-243) enquanto a navegação chama a feature de 'ampliar'. Billing rotula 'lumens · créditos avulsos' enquanto o dashboard diz 'avulsos' e a conta diz 'Lumens'.
- impact: Para arquitetos não-técnicos, 'pixels fora da máscara' e percentuais soam como log de engenharia; a tripla nomenclatura (Ampliar/Upscale, Lumens/avulsos, Editar/Retocar nos comentários e títulos) dilui a sensação de produto polido.
- recommendation: Drift: 'A edição alterou levemente áreas fora da seleção. Recomendamos refazer — sem custo extra se rejeitar.' Hint de máscara: 'Área selecionada: 12%'. Unificar glossário: Ampliar (nunca upscale na UI), Nodes avulsos (Lumens só como nome do pack na compra).
- effort: baixo
- (sem verificacao adversarial)

### [P3] 15. Funcionalidades-fantasma visíveis: '+ Pack' → alert 'Em breve.', 'Usar no Spaces' desabilitado, escala 'Ultra' trancada
- files: components/spaces/VistaDetail.tsx:258; app/app/upscale/UpscaleClient.tsx:675-679; app/app/upscale/UpscaleClient.tsx:72
- evidence: VistaDetail.tsx:258: `<ActionGhost onClick={() => alert('Em breve.')}>+ Pack</ActionGhost>`. UpscaleClient.tsx:675-679: botão 'Usar no Spaces' permanentemente disabled com title 'Em breve'. UpscaleClient.tsx:72: escala 'Ultra' com locked:true e cadeado.
- impact: Botões clicáveis que terminam em alert nativo ou nunca habilitam passam sensação de produto inacabado no lançamento; 'Ultra' trancado sem explicação de como destravar não gera upsell, só ruído.
- recommendation: Remover '+ Pack' e 'Usar no Spaces' até existirem (ou badge 'em breve' não-clicável consistente com o padrão da sidebar). Para 'Ultra', ou remover ou transformar em upsell explícito ('disponível no plano Studio').
- effort: baixo
- (sem verificacao adversarial)

### [P3] 16. Sem estimativa de tempo no Renderizar/Upscale; barra de progresso fake de 40s fixos
- files: app/app/generate/GenerateClient.tsx:1119-1121; app/globals.css:85-88; app/app/upscale/UpscaleClient.tsx:649-654
- evidence: O loading do Renderizar anima `loadProgress 40s` fixo até 88% (globals.css:85-88, GenerateClient.tsx:1120) sem nenhum texto de expectativa ('~40s'); o Upscale mostra apenas spinner + frases rotativas (UpscaleClient.tsx:649-654). Só o Animar comunica duração real ('entre 1 e 4 minutos', VideoGenerationTimeline.tsx:110).
- impact: Sem âncora de tempo, esperas de 30-60s parecem travamento — especialmente para usuário novo gastando os nodes grátis. A barra que congela em 88% quando estoura 40s reforça a sensação de erro.
- recommendation: Exibir 'normalmente leva ~40s' (Renderizar) e '~30-90s' (Upscale) junto ao loading, e calibrar a animação por engine/resolução como o vídeo faz com estimatedGenerationMs.
- effort: baixo
- (sem verificacao adversarial)
