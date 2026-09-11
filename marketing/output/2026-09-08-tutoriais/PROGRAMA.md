# Serie de Reels tutoriais — uso da plataforma

Gerado em 2026-09-08. Cada Reel ensina UM fluxo, sem audio: o ensino esta na
imagem e numa legenda curta na tela.

## Estado

| Reel | Situacao | Observacao |
|---|---|---|
| primeiros 80 nodes | **FEITO** | 8,5 s — cadastro, custo por qualidade, resultado real |
| instalar o plugin | **FEITO** | 12,0 s — os 3 passos da pagina /sketchup + primeiro render |
| 2026-09-08-tutorial-renderizar-4-passos | roteiro pronto | precisa de login · verificacao: aprovado_com_correcoes (10 apontamentos) |
| 2026-09-08-reel-historico-onde-ficam-os-renders | roteiro pronto | precisa de login · verificacao: aprovado_com_correcoes (10 apontamentos) |
| ampliar-4x-render-aprovado | roteiro pronto | precisa de login · verificacao: aprovado_com_correcoes (12 apontamentos) |
| 2026-09-08-primeiros-passos-80-nodes | roteiro pronto | precisa de login · verificacao: aprovado_com_correcoes (10 apontamentos) |
| 2026-09-08-reel-planta-humanizada-tutorial | roteiro pronto | precisa de login · verificacao: aprovado_com_correcoes (6 apontamentos) |
| 2026-09-08-reel-animar-tutorial-reels-vertical | roteiro pronto | precisa de login · verificacao: aprovado_com_correcoes (5 apontamentos) |
| 2026-09-08-reel-editar-v3-tutorial-material | roteiro pronto | precisa de login · verificacao: aprovado_com_correcoes (7 apontamentos) |
| 2026-09-08-spaces-passo-a-passo | roteiro pronto | precisa de login · verificacao: aprovado_com_correcoes (7 apontamentos) |

## Dois avisos de honestidade que a verificacao levantou

1. **Nao use `components/landing/ProductMockup.tsx` nem `public/demo-plataforma.html` como print do app.**
   Os dois sao desenhos a mao que espelham os tokens do produto, nao capturas da interface.
   Legendar como "a tela do SPACENODE" seria mockup vendido como print.
2. **Capturar a conta do dono expoe dado real.** `docs/marketing/prohibited-content.md` §6 proibe
   nome, e-mail, saldo e projeto identificavel em screenshot. No Historico aparecem nomes de
   projetos reais; e o e-mail do dono esta em INTERNAL_STAFF_EMAILS, entao o drawer de detalhes
   abre em modo privilegiado (dados internos). Mascarar ou usar projeto de demonstracao.

## Como destravar as capturas do app

As telas logadas (Renderizar, Editar, Ampliar, Animar, Spaces, Planta humanizada,
Historico) nao podem ser capturadas sem uma sessao. O caminho, uma vez so:

```bash
node marketing/scripts/produto/capturar.mjs --login
```

Abre uma janela, voce loga (Google ou e-mail), a janela fecha sozinha e o perfil
fica salvo. Nenhuma credencial passa pelo script. Depois:

```bash
node marketing/scripts/produto/capturar.mjs --app
```

Le `marketing/specs/2026-09-08-tutoriais/captura-app.json` e fotografa cada estado.
Passos marcados `"paga": true` sao PULADOS — nenhum node e gasto.

## Roteiros por modulo

### Renderizar

- **rota**: `/app/generate`
- **hook**: print do sketchup vira render em 4 passos
- **promessa**: Quem assistir sabe onde clicar, em que ordem, e quanto custa antes de apertar o botão — consegue repetir o fluxo sozinho na primeira tentativa.
- **custo**: Tabela única em lib/engines.ts:22-56 (a UI, a API e o débito leem daí). Vega: 2K = 20 nodes, 4K = 40 (sem HD). Pulsar: HD = 10, 2K = 15, 4K = 25. Quasar: só 2K = 28 (sem 4K — teto de 2048 px do endpoint). O número aparec
- **onde comeca a gastar**: O clique no botão "gerar render" (app/app/generate/GenerateClient.tsx:1168, data-guide="gerar") → handleGenerate (:623) → POST /api/generate → RPC consume_workspace_nodes (app/api/generate/route.ts:336). TUDO antes disso é de graça: upload da imagem, todas as 
- **cenas**:
  3.5s · [ui] 1. arraste o print — Painel direito de /app/generate, área de upload vazia. O arquivo casa.jpg entra arrastado da esquerda pra dentro da moldura tracejada; a borda acende 
  4s · [ui] 2. espaço e iluminação — Corte pro painel esquerdo. Zoom fechado nos blocos TIPO DE PROJETO → SEGMENTO → ESPAÇO → ILUMINAÇÃO, com o cursor acendendo uma pílula por bloco, de c
  3.5s · [ui] 3. vega 2k custa 20 nodes — Continua descendo no mesmo painel: MOTOR DE IA com os três cards (Vega · Premium, Pulsar · Rápido, Quasar · Especial) e o cursor selecionando Vega; em
  3s · [ui] 4. gerar render — Fim do painel esquerdo: o botão "gerar render" com a segunda linha "20 Nodes por render". Cursor entra, o botão fica em estado hover, corta ANTES do c
  4s · [asset] o render sai no comparador — Par real do acervo (marketing/renders/antes/casa.jpg → depois/casa.jpg) no mesmo enquadramento, revelado com wipe horizontal linear da esquerda pra di
- **CTA**: Card final 1,5s: fundo #0A0A0A, símbolo ConstellationN monocromático centralizado, wordmark spacenode.app abaixo e, no terço central inferior, a linha "teste grátis no link da bio" em Geist Regular branca. Sem emoji, sem verde de fundo.
- **correcoes exigidas pela verificacao** (aprovado_com_correcoes):
  - ALTA · roteiro → cena 5 (asset, "o render sai no comparador"): A cena manda reproduzir os selos ANTES/DEPOIS "no mesmo desenho dos selos do comparador do produto" sobre um par do acervo, logo depois de 4 cenas de UI que terminam no hover do botão "gerar render".  → Ou o dono gera um render real com Vega·2K a partir de casa.jpg e a cena 5 filma o comparador de verdade, ou a cena 5 abandona o desenho dos selos do produto: wi
  - ALTA · passo 15 + custo_nodes ("Melhorar qualidade (2K / 4K)"): Duplo erro de custo/funcionalidade. (a) O botão nunca gera 4K: o handler é fixo em 2K. (b) O material afirma que o número debitado é o da segunda linha do botão; nesse caminho não é — a pré-checagem u → Reescrever o passo 15: "Melhorar qualidade (2K / 4K)" é só o rótulo — a ação sempre regera em 2K e debita o preço de 2K do motor atual (Vega 20, Pulsar 15, Quas
  - (+8 apontamentos medios/baixos no journal do workflow)

### Histórico (/app/history)

- **rota**: `/app/history`
- **hook**: onde seus renders ficam depois de prontos
- **promessa**: No fim, o arquiteto sabe abrir o Histórico, ver a imagem original de cada render sem sair da grid, abrir a ficha com a configuração usada e os nodes que aquela geração custou, e baixar — sozinho, sem gastar node nenhum.
- **custo**: 0 nodes — a rota inteira é leitura. Nenhum handler chamado pelo Histórico debita: app/api/renders/list/route.ts, app/api/history/detail/route.ts, app/api/renders/batch/route.ts (delete/move) e app/api/download/route.ts n
- **onde comeca a gastar**: O gasto NÃO começa dentro de /app/history. Abrir a rota, trocar de aba, buscar, filtrar, criar pasta, mover, excluir, abrir o painel "Detalhes da geração", copiar briefing e baixar (individual ou em lote) custam 0. A fronteira são três botões do drawer que lev
- **cenas**:
  3s · [ui] tudo que você gerou fica aqui — Captura da grid de /app/history: barra lateral com "Histórico" marcado, aba "Renders" ativa e as miniaturas em grade. Ken Burns quase parado (1 → 1.02
  3.5s · [ui] o mouse mostra a imagem original — Close num card com o mouse parado em cima: a miniatura rotulada "antes" no canto superior esquerdo e os botões "Ver →" e "baixar" no canto inferior di
  4s · [ui] o clique abre a ficha da geração — O painel "Detalhes da geração" aberto à direita, rolado até "Configuração usada" e "Imagem base". Corte seco a partir da cena anterior.
  4s · [ui] quanto custou e o arquivo cheio — Mesmo painel, agora no bloco "Custo e desempenho" com a linha "Nodes consumidos", e o botão "Baixar imagem" destacado no topo.
  1.5s · [card] abrir, ver e baixar: 0 nodes — Card final da marca: logo ConstellationN monocromático, pílula de CTA e microcopy. Sem imagem de produto.
- **CTA**: Teste grátis no link da bio.
- **correcoes exigidas pela verificacao** (aprovado_com_correcoes):
  - ALTA · captura #5 "selecao-e-barra-de-acoes" — preparo (clicar nth 0,1,2 em div[title="Ver detalhes da geração"] depois de entrar em modo seleção): O seletor deixa de existir exatamente no estado em que a receita o usa. O card só recebe o atributo title fora do modo seleção; ao clicar em "Selecionar" o title vira undefined em todos os cards, entã → Guardar os handles dos 3 cards ANTES de entrar em seleção (const cards = await page.locator('div[title="Ver detalhes da geração"]').all() e clicar cards[0..2] d
  - ALTA · captura #3 e #4 (drawer) — "Screenshot só do aside" com login do dono: O e-mail do dono está em INTERNAL_STAFF_EMAILS no .env.local, então a rota de detalhe devolve viewer.privileged = true e o drawer capturado é a versão ADMIN: aparece o botão "Copiar log técnico" na gr → Capturar logado em conta de demo NÃO-staff (ou tirar o e-mail de INTERNAL_STAFF_EMAILS no .env.local antes do shoot) e conferir no frame que não há "Copiar log 
  - ALTA · custo_nodes / preparo de todas as capturas — "Login manual do dono" + máscara só de saldo e autoria: O BRIEF proíbe filmar dados reais: "NUNCA gravar dados reais de usuários do beta — usar conta/projeto de demo". O plano monta a peça em cima do Histórico real do dono, e as miniaturas que preenchem a  → Fazer o shoot em conta de demo semeada com os 6 pares autorizados de marketing/renders/, ou listar explicitamente na spec quais renders da grid têm permission_s
  - (+7 apontamentos medios/baixos no journal do workflow)

### Ampliar

- **rota**: `/app/upscale`
- **hook**: amplie o render aprovado sem gerar de novo
- **promessa**: quem assistir sabe abrir o Ampliar, subir o render já aprovado, escolher Resolução → Alta Fidelidade → 4×, conferir o custo em nodes no rodapé antes de confirmar e comparar/baixar o resultado
- **custo**: Fórmula única (UI e backend usam a mesma) em lib/upscale/costs.ts:76-91 — total = ceil(base_do_modo × multiplicador_de_escala) + acréscimo_por_megapixel. Base por modo (costs.ts:25-32): Alta Fidelidade 10, Recuperar Imag
- **onde comeca a gastar**: O clique no botão do rodapé — "Ampliar Imagem" (aba Resolução) ou "Aprimorar Imagem" (aba Aprimorar), app/app/upscale/UpscaleClient.tsx:671-681. Ele chama handleSubmit (:353), que sobe o arquivo pro Storage (uploadDirect, :362 — de graça) e faz POST /api/upsca
- **cenas**:
  3s · [ui] menu Ampliar, envie a imagem — captura de /app/upscale com a barra lateral à esquerda (item Ampliar destacado) e o painel de envio vazio: área tracejada 'Arraste ou clique para envi
  3.5s · [ui] aba Resolução, modo Alta Fidelidade — painel esquerdo com a miniatura carregada e '1376×768px · JPG · 264 KB', a faixa verde 'Recomendado: Alta Fidelidade' e a aba 'Resolução' sublinhada; 
  3.5s · [ui] escala 4×: 20 nodes — fileira ESCALA com 2× ~4K, 4× ~8K, 8× até 16K; cursor marca o 4× e o rodapé atualiza para 'Custo: 20 Nodes' logo acima do botão 'Ampliar Imagem' (sald
  4s · [asset] arraste, compare e baixe — comparador antes/depois montado com uma ampliação real da conta (par input_url/output_url de um render ambient='upscale'), rótulos ORIGINAL e AMPLIADO
  2s · [card] teste grátis no link da bio — card final #0A0A0A: símbolo ConstellationN monocromático + wordmark spacenode e 'spacenode.app' abaixo
- **CTA**: Teste grátis no link da bio.
- **correcoes exigidas pela verificacao** (aprovado_com_correcoes):
  - ALTA · captura[0] 01-entrada-vazia (preparo) + pegadinha 8 ('o topo mostra o saldo em nodes, components/app/Topbar.tsx:70-84'): A rota /app/upscale NÃO renderiza Topbar nenhuma — o layout do app só monta a Sidebar, e components/app/Topbar.tsx não é importado em lugar algum do repo (componente morto). Quem seguir o preparo vai  → Trocar a instrução por: 'mascarar o bloco do avatar no rodapé da sidebar (nome do usuário + "N nodes") e o "Saldo: N Nodes" do rodapé do módulo; manter só o "Cu
  - (+11 apontamentos medios/baixos no journal do workflow)

### Primeiros passos: cadastro, 80 nodes grátis, custo de cada geração e onde ver o saldo

- **rota**: `/login?mode=signup`
- **hook**: como usar seus 80 nodes grátis
- **promessa**: No fim do Reel o arquiteto sabe criar a conta, sabe que ela começa com 80 nodes, sabe onde ver o saldo e sabe que um render em Pulsar HD custa 10 nodes — ou seja, 8 imagens de graça.
- **custo**: Tabela única em lib/engines.ts:23-58 — Vega 2K 20 / 4K 40 (:30); Pulsar HD 10 / 2K 15 / 4K 25 (:36); Quasar 2K 28 (:56, sem 4K). O custo do clique é calculado por getNodesCost(engine, resolution) em lib/engines.ts:76-84 
- **onde comeca a gastar**: O único gasto é o clique no botão [data-guide="gerar"] rotulado "gerar render" (app/app/generate/GenerateClient.tsx:1167-1190). Ele dispara POST /api/generate, que resolve o custo em app/api/generate/route.ts:295 e debita em :336 antes de chamar o provedor (há
- **cenas**:
  3.5s · [ui] criar conta: e-mail e senha — Captura de spacenode.app/login?mode=signup com a aba "Criar conta" ativa, os campos de e-mail e senha e o botão "Continuar com Google" abaixo. Ken Bur
  3s · [ui] a conta já nasce com 80 nodes — Corte para a mesma tela, agora com zoom fechado na linha de confiança sob o formulário: "80 nodes grátis · Sem cartão · Suporte em português". A palav
  3.5s · [ui] o saldo fica aqui e na lateral — Painel /app com o card de métrica "Nodes disponíveis" contornado por um retângulo fino branco (valor numérico mascarado), e um segundo contorno na sid
  4s · [ui] subir a imagem não gasta node — Sidebar → "Renderizar" acesa, corte para /app/generate com a área vazia "arraste sua imagem aqui / SketchUp · Render · 3D · JPG · PNG · até 15 MB" e a
  5s · [ui] pulsar hd: 10 nodes por render — Coluna de controles: bloco "QUALIDADE DE SAÍDA" com o cartão HD selecionado escrito "10 Nodes por imagem", e logo abaixo o botão "gerar render · 10 No
  2.5s · [card] teste grátis no link da bio — Card final #0A0A0A: logo ConstellationN monocromático + wordmark, linha "80 nodes = 8 renders no Pulsar HD" e o endereço spacenode.app.
- **CTA**: teste grátis no link da bio
- **correcoes exigidas pela verificacao** (aprovado_com_correcoes):
  - (+10 apontamentos medios/baixos no journal do workflow)

### Planta Humanizada (item "Planta humanizada" da seção CRIAR da sidebar; URL vive sob /app/apresentar)

- **rota**: `/app/apresentar/planta-humanizada`
- **hook**: planta técnica vira planta de apresentação
- **promessa**: No fim dos 16 s o arquiteto sabe onde fica o módulo, o que subir, quais dois controles decidem o resultado, quanto custa o clique (20 nodes) e o que sai do outro lado — dá pra repetir sozinho na primeira tentativa.
- **custo**: 20 Nodes por geração. A UI lê `APRESENTAR_TOOLS.humanized_plan.nodes = 20` (C:/Users/Pisoni/spacenode/lib/apresentar/config.ts:42) e escreve "Custo: 20 Nodes" no rodapé (PlantaHumanizadaClient.tsx:345). O servidor não co
- **onde comeca a gastar**: O clique no botão "Gerar planta humanizada" (PlantaHumanizadaClient.tsx:351-361). Tudo antes dele é de graça e pode ser fotografado à vontade: abrir o módulo, subir a planta, trocar de estilo, trocar de nível, abrir "Ajustes avançados", ligar/desligar as 6 cha
- **cenas**:
  3.8s · [ui] criar › planta humanizada — Captura 'planta-carregada': o módulo aberto com a planta técnica já dentro do campo de upload, migalha CRIAR › PLANTA HUMANIZADA visível no topo do pa
  3.6s · [ui] escolha estilo e nível — Captura 'estilo-e-nivel': painel esquerdo rolado até mostrar os 5 cards de Estilo visual e os 3 botões de Nível de humanização, com 'Imobiliário premi
  3s · [ui] 20 nodes por geração — Captura 'custo-e-botao': recorte do rodapé com 'Custo: 20 Nodes' legível e o botão preto 'Gerar planta humanizada'. O 'Saldo' fica mascarado com retân
  4.6s · [asset] a planta que o cliente entende — Par real do acervo (input_url → output_url de um render com ambient 'planta humanizada' da conta do dono): planta técnica revelando a planta humanizad
  1.4s · [card] teste grátis no link da bio — Card final do kit: logo ConstellationN monocromático, pílula de CTA e microcopy '80 nodes grátis · sem cartão · em português'.
- **CTA**: Teste grátis no link da bio.
- **correcoes exigidas pela verificacao** (aprovado_com_correcoes):
  - (+6 apontamentos medios/baixos no journal do workflow)

### Animar

- **rota**: `/app/video`
- **hook**: seu render vira reels vertical em tres cliques
- **promessa**: No fim do Reel o arquiteto sabe repetir sozinho: abrir Animar, subir um render, clicar no tipo "Reels de Projeto" (que ja deixa 9:16 e 6s), ler os 210 Nodes no rodape e clicar em Gerar video.
- **custo**: 210 Nodes na configuracao que o Reel ensina (preset "Reels de Projeto" = motor "Cinematico"/Veo 3.1 em 6s). Tabela de precos, fonte unica: lib/video/models.ts:107 — costInNodes { '4': 140, '6': 210, '8': 280 } para 'fal-
- **onde comeca a gastar**: O gasto comeca EXATAMENTE no clique do botao "Gerar video", no rodape fixo do painel da direita (app/app/video/_components/CostSummary.tsx:77, rotulo definido em :27). Ele chama generate() (app/app/video/_hooks/useVideoGeneration.ts:26), que sobe a imagem pro 
- **cenas**:
  3.2s · [ui] animar. envie um render. — Captura de /app/video com a sidebar mostrando "Animar" ativo e o canvas vazio (retangulo tracejado). Cursor desenhado parando no botao "Selecionar ima
  4.2s · [ui] tipo reels: 9:16 e 6s — Painel da direita: o card "Reels de Projeto" recebendo o clique (ponto verde acendendo) e, em corte seco, o bloco FORMATO ja em "9:16 Vertical" e o bl
  3.8s · [ui] 210 nodes. o preco vem antes. — Recorte do rodape fixo do painel: "Custo desta geracao · 210 Nodes", "Fica pronto em ~2–4 min" e o botao preto "Gerar video" (saldo mascarado).
  4.4s · [asset] pronto: baixar, ajustar, gerar de novo — Video 9:16 REAL do Animar, ja existente no acervo (nada gerado para este Reel), rodando cheio na tela; pilula discreta "Animar · 6s" abaixo da banda.
  1.4s · [card] teste gratis no link da bio — Card final da marca: logo ConstellationN monocromatico sobre #0A0A0A, pilula de CTA e microcopy "80 nodes gratis · sem cartao · em portugues".
- **CTA**: Teste gratis no link da bio.
- **correcoes exigidas pela verificacao** (aprovado_com_correcoes):
  - ALTA · roteiro.hook — "seu render vira reels vertical em tres cliques": O numero "tres cliques" e inventado e a propria peca desmente. O caminho minimo que o Reel mostra tem 4 cliques no app: (1) "Animar" na sidebar, (2) "Selecionar imagem" — que ainda abre o file picker  → Trocar o hook por uma formulacao sem contagem, ancorada no que a tela mostra: "seu render vira reels vertical: tipo Reels, 210 nodes, gerar" ou "um render, um p
  - (+4 apontamentos medios/baixos no journal do workflow)

### Editar V3 (módulo "Editar" na barra lateral)

- **rota**: `/app/editar`
- **hook**: trocar o piso sem refazer o render
- **promessa**: quem assiste sabe abrir o Editar, escolher a ação, escrever o pedido, marcar a área e aplicar — sabendo quanto custa antes de clicar
- **custo**: 18 nodes por edição em qualquer imagem acima de 1,4 MP (todo render 2K ou 4K cai aqui) e 10 nodes em imagens de até 1,4 MP. O preço não é tabela: sai do custo do provider com margem-alvo de 50% e node valendo US$0,0135 —
- **onde comeca a gastar**: O gasto começa e termina em um único clique: o botão verde "Aplicar na área marcada" / "Aplicar na imagem" (components/edit-v3/EditV3Flow.tsx:608 → handleGenerate :255 → POST /api/edit-v3/google SEM dry_run em :274). Tudo antes é grátis: upload da imagem e da 
- **cenas**:
  3s · [ui] arraste o render em Editar — tela do Editar no estado vazio: a área tracejada "Envie uma imagem do projeto". O render é solto ali e aparece no canvas escuro. Hook em texto sobre o
  4s · [ui] escolha a ação e descreva — cursor clica no cartão "Material" dentro de "O que deseja fazer" (o cartão acende com a borda e o ícone verde) e o campo "Descreva a mudança" recebe, 
  4.5s · [ui] marque a área: o resto fica igual — laço contornando o piso: o traço fecha e a área fica coberta pela camada verde translúcida; o rodapé do canvas muda para "Área marcada — a edição fica
  4.5s · [ui] 18 nodes, cobrados só se der certo — zoom curto no painel "Custo estimado — 18 nodes", clique no botão verde "Aplicar na área marcada" e corte para a tela "Edição aplicada" com a alça ant
  2s · [card] teste grátis no link da bio — card final #0A0A0A: símbolo ConstellationN branco centralizado + wordmark spacenode.app abaixo, sem emoji, sem selo.
- **CTA**: Teste grátis no link da bio.
- **correcoes exigidas pela verificacao** (aprovado_com_correcoes):
  - (+7 apontamentos medios/baixos no journal do workflow)

### Spaces

- **rota**: `/app/spaces/new`
- **hook**: como gerar várias vistas do mesmo projeto
- **promessa**: Ao terminar, o espectador sabe criar um Space, subir a Vista Mestre, pagar os 8 nodes do DNA, travar esse DNA e montar a proxima vista do mesmo projeto pela sequencia Referência → Ação → Gerar — e sabe que cada vista tem custo proprio em nodes.
- **custo**: Duas cobrancas distintas. (1) Extracao de DNA = 8 nodes, fixo nos dois caminhos: DNA_EXTRACTION_COST em lib/spaces/economy.ts:9, exibido no rodape de app/app/spaces/new/page.tsx:102 e no botao components/spaces/NewSpaceF
- **onde comeca a gastar**: O gasto comeca exatamente no clique de 'Analisar · 8 nodes' (components/spaces/NewSpaceFlow.tsx:532) — ou de 'Extrair DNA · 8 nodes' no caminho A (components/spaces/FromRenderFlow.tsx:555). Tudo antes disso e gratuito, inclusive criar o Space no 'Continuar →' 
- **cenas**:
  3.5s · [ui] crie o projeto e escolha o motor — Captura de /app/spaces/new com os dois cards de origem ('A partir de uma render' e 'Subir imagem'); cursor pousa em 'Subir imagem' e corta para a Etap
  4s · [ui] analisar a Vista Mestre: 8 nodes — Etapa 2 de 2 · Vista Mestre: a imagem carregada ocupando o dropzone, badge de saldo no rodape (mascarado) e o botao 'Analisar · 8 nodes' em destaque. 
  3.5s · [ui] trave o DNA do projeto — Faixa 'DNA do projeto' com os quatro cartoes — Estilo, Materiais, Paleta, Contexto — e o selo 'DNA travado' no topo do Space.
  5s · [ui] Quasar 2K: 28 nodes por vista — Painel de geracao com as tres etapas numeradas: aba 'Vista Mestre' na Referência, card 'Nova Vista' na Ação, card 'Novo ângulo' marcado, resumo 'Será 
  2s · [card] teste grátis no link da bio — Card final: simbolo ConstellationN monocromatico branco sobre #0A0A0A, wordmark 'spacenode.app' abaixo, muito respiro, sem emoji.
- **CTA**: teste grátis no link da bio
- **correcoes exigidas pela verificacao** (aprovado_com_correcoes):
  - (+7 apontamentos medios/baixos no journal do workflow)

