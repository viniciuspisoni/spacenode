# SPACENODE para SketchUp

Extensão oficial da SPACENODE: renderização fotorrealista das vistas do
SketchUp com o mesmo motor de fidelidade do app web.

## Superpoderes nativos (Fase 2)

O que só um plugin dentro do modelo consegue:

- **Cenas em lote** — selecione as cenas do modelo e gere o caderno inteiro
  com os mesmos presets e a mesma semente (coerência de material/estilo).
  Falha de uma cena não derruba o lote; saldo insuficiente aborta o resto.
- **Captura determinística** — sketchy edges, extensão de linha, névoa,
  guias e a grade de seção saem da imagem que a IA vê (restauro manual das
  RenderingOptions — nunca via abort_operation, que não as reverte).
- **Edge map nativo** — segunda captura em hidden-line da MESMA câmera vira
  o mapa estrutural do motor de fidelidade (`edgeMapKey` no /api/generate),
  no lugar do edge map inferido do pixel.
- **Sol e lente reais no prompt** — posição solar calculada do ShadowInfo
  (lat/long/hora) + FOV/focal da câmera viram `modelFacts` (bloco MODEL
  FACTS do ramo Máxima). Presets de sol (Manhã/Meio-dia/Entardecer/Golden
  hour) aplicados só durante a captura.
- **Materiais do modelo** — texturas reais exportadas como `materialRefs`
  (até 4, superfície escolhida no painel).
- **Voltar à vista** — cada render guarda a câmera; um clique restaura o
  enquadramento exato no SketchUp.

## O que mudou na 1.3.0 — planta humanizada sem exportar nada

A Planta humanizada existe no site e vende desde sempre. Lá ela começa com um
obstáculo que não é do produto: **o usuário precisa TER a planta como imagem**
— exportar do CAD, achar o arquivo, subir. Quem está dentro do SketchUp já tem
o desenho; falta só olhar de cima.

A aba **Planta** desenha a planta do modelo aberto e manda pra mesma rota que o
site usa:

- **Câmera no topo, projeção paralela** — planta não tem fuga.
- **Corte horizontal a 1,20 m do piso** do pavimento onde a câmera está. Sem
  corte, a vista de cima mostra o telhado.
- **Render em linha escondida**, com o corte preenchido: é o que lê como parede.

### O corte do arquivo manda

Se o modelo já tem um plano de corte ativo, ele é usado **como está** — quem
mantém uma cena de planta no .skp cortou onde queria, e sobrescrever isso seria
trocar o projeto do usuário pelo nosso palpite. Só quando não existe corte
ativo o plugin cria um temporário e desfaz no fim (`abort_operation`; a câmera
e as RenderingOptions voltam à mão, porque não entram em operação).

O painel conta qual dos dois aconteceu no aviso do resultado: *"corte do
próprio arquivo"* ou *"corte temporário a 1,20 m"*. Se a planta sair do
pavimento errado, é essa linha que diz por quê.

### Presets sem terceira cópia

Tipo de projeto, estilo, nível e o que entra (mobiliário, vegetação, texturas,
sombras, traço técnico, nomes dos ambientes) vêm do **catálogo v9**, que lê
`lib/apresentar/config.ts` — a mesma fonte do site. Nem o Ruby nem o painel
guardam a lista do que o servidor aceita.

### A rota passou a atender os dois

`/api/apresentar/humanized-plan` trocou o cookie puro por `getRequestUser` (o
mesmo portão do `/api/generate`), o que deixa o token de dispositivo do plugin
entrar, e ganhou uma segunda entrada: além do multipart do site, aceita **JSON
com `sourceKey`** — a planta sobe pro Storage pela mesma área do Renderizar e
a chave viaja no corpo. Montar multipart de dentro do Ruby seria escrever
boundary e binário na mão.

O resultado cai no palco como qualquer render: baixar, ampliar e abrir no site
vêm de graça.

**Ainda sem smoke real:** a captura de planta (corte, projeção paralela,
enquadramento) só roda dentro do SketchUp.

## O que mudou na 1.2.0 — o modelo conta o tamanho do ambiente

Uma imagem não tem escala. É por isso que um render inventa pé-direito de 4 m
numa sala de 2,70, porta de 2,40 e bancada na altura errada — o motor escolhe
a proporção que fizer a composição parecer grandiosa, porque nada na entrada
diz o contrário. Quem está **dentro do modelo** não precisa adivinhar: mede.

O plugin já media a altura do olho por `raytest` (piso sob a câmera). A 1.2.0
mede mais duas coisas no mesmo gesto e manda no bloco MODEL FACTS:

- **Pé-direito** — piso até teto sob a câmera.
- **Largura** — parede a parede na altura do olho, atravessando a vista.

No prompt vira uma linha que diz de onde veio o número:

> Room, measured in the 3D model at the camera position: floor-to-ceiling
> height 2.7 m; about 4.25 m wall to wall across the view — keep every scale
> cue consistent with these real dimensions (…); never stretch the space taller
> or wider than it is to make the composition look grander.

### Honestidade do fato

Medida errada no prompt é pior que medida nenhuma, então tudo passa por porta:

- Cada raio só vale entre **0,4 e 40 m** (`ROOM_RAY_RANGE_M`); o pé-direito,
  entre **1,8 e 20 m**. Fora disso, não vira fato.
- Raio que não acerta nada não manda nada — é o caso da **vista externa**, que
  naturalmente fica de fora sem precisar de flag.
- A largura é medida **na altura do olho**: um raio lateral pode acertar uma
  estante em vez da parede, e o erro é da ordem da profundidade do móvel. Por
  isso o prompt diz "about" e "at the camera position" — o texto não promete
  mais precisão do que a medida tem.
- O servidor não confia no cliente: `sanitizeModelFacts` reclampa nas mesmas
  faixas antes de qualquer coisa entrar no prompt.

### O que aparece no painel

O HUD da folha Fotografia passou a mostrar o que foi medido, ao lado da lente
e da altura do olho: `35 mm · 38° · olho a 1,60 m · pé-direito 2,70 m`. Se a
medida não passou na porta, a linha some — o painel não mostra número que não
foi mandado.

**Ainda sem medição de campo:** que o número melhore o render é a tese, não um
resultado. O A/B pago é do dono.

## O que mudou na 1.1.1 — a moldura da captura fica na tela

Relato de campo: "após clicar em capturar vista, ele muda o ponto de visão da
captura". Não mudava a câmera — mudava o QUADRO, e nada na tela dizia isso.

**"Capturar vista" não é um print da viewport.** É um render novo no quadro
escolhido, e o SketchUp preserva o campo de visão. Com a viewport em ~2,6:1 e
16:9 escolhido na folha Fotografia, cerca de **32% da largura fica fora** — o
render parece "aproximado" em relação à tela.

A moldura que mostraria isso existia em dois lugares, e os dois falhavam:

- A `GuidesOverlay` desenhava o quadro, mas o `draw` saía fora na primeira
  linha quando o guia de composição era "none" — que é o padrão. Quem não usa
  guias nunca via moldura nenhuma. E `Sketchup::Overlay` só existe no
  **SketchUp 2023+**: em 2021/2022 ela nunca foi opção.
- A moldura nativa (`camera.aspect_ratio`, as barras cinza que o SketchUp
  desenha sozinho) até era aplicada quando o usuário escolhia a proporção —
  mas mora na CÂMERA, e **trocar de cena troca a câmera**. A moldura sumia da
  tela sem que o painel mudasse de ideia, e a captura seguia recortando.

### O que passou a valer

- **A moldura é reaplicada sempre que a vista muda** (`reapply_camera_frame` em
  `camera_changed` e em `model_switched`). É a moldura nativa, então funciona
  em toda versão suportada, inclusive 2021/2022. Converge sozinha: reaplicar
  dispara `onViewChanged`, e na segunda passada `apply_camera_aspect` não
  escreve mais nada.
- **A overlay desenha o quadro mesmo sem guia de composição** (2023+), com o
  que fica de fora escurecido. Quando as barras nativas já estão na tela ela
  não escurece de novo — entra só com a borda, pra não empilhar cinza.
- **O painel conta o corte antes de capturar.** `camera_facts` passou a mandar
  `viewAspect` (a proporção da VIEWPORT, que o painel não tinha), a linha
  "Fotografia" virou `16:9 · laterais fora · 35 mm` e a folha explica com o
  número da tela. E a linha passou a se atualizar na hora: antes ela só
  mudava quando outro evento passasse pelo `updateShell`, então continuava
  dizendo "Livre" depois de o usuário já ter escolhido 16:9.

### Restauro de câmera verificado

`view.camera` devolve a câmera VIVA. O espelho e o nivelamento guardavam essa
referência e reatribuíam depois — se o SketchUp escreve os valores no próprio
objeto, isso não restaura nada e a viewport fica na câmera temporária (a
refletida, no caso dos espelhos). Agora guardamos os números junto com a
referência: restaura pela referência, que preserva o que um `Camera.new` não
reproduz (perspectiva de 2 pontos nativa), e só remonta a partir dos números se
a vista não tiver voltado. Conservador de propósito — o caminho que já
funcionava não muda.

Na mesma linha, a moldura temporária da captura passou a ser desfeita na câmera
VIVA: se algum passo trocou o objeto da vista, escrever no `capture_camera`
deixaria a moldura presa na viewport do usuário.

## O que mudou na 1.1.0 — um botão de gerar por vez

Feedback de campo: "dificuldade com a usabilidade" e "não consegui escolher o
motor". O painel não tinha pouca coisa — tinha coisa demais disputando o mesmo
lugar. Medido no painel real (440×780), antes desta versão:

- **Três CTAs pretos na mesma tela.** O dock é fixo e o "Gerar render" ficava
  ativo em TODAS as abas: na aba Cenas apareciam "Gerar 2 cenas · 40 nodes",
  "Criar Space · 48 nodes" e "Gerar render · 20 nodes" ao mesmo tempo, cada um
  gerando (e cobrando) coisa diferente. Na aba Editar o "Aplicar edição" estava
  cinza enquanto o botão preto do dock gerava outra coisa.
- **Nenhuma configuração na primeira tela.** O palco vazio ocupava 620 px dos
  780; as linhas Cena/Luz/Fotografia/Saída começavam por volta de y≈1000.
- **Oito pílulas brancas idênticas** depois do render, antes de qualquer
  outra coisa.
- **O painel nunca rolava até o resultado** — `scrollIntoView` aparecia zero
  vezes no arquivo. Quem estava na configuração (que é onde se mexe) recebia o
  render fora da tela e via só o aviso verde de nodes gastos.
- **O motor não se explicava.** Cartões de 133 px com um nome de astronomia e
  um chavão, sem preço — o preço só aparecia no cartão de Qualidade, abaixo, e
  mudava ao trocar de motor. A `description` que o /app/generate mostra já
  existia em `lib/engines.ts`; o catálogo do plugin não enviava. E a
  "Qualidade" do Quasar era um cartão sozinho e sempre marcado — o padrão que o
  web tinha acabado de deletar por ser "um controle que não se opera".

### O que passou a valer

- **Um CTA por aba, sempre no dock.** `TAB_CTA` mapeia aba → botão; os botões
  são os mesmos de antes (mesmo id, mesmo listener, mesmo rótulo), só mudaram de
  endereço. Em Editar/Animar o dock perde resumo, alcance e aviso de saldo —
  os três falam do custo do RENDER. Ctrl+Enter passou a seguir a aba ativa, e o
  botão "Gerar render" da toolbar nativa volta pra aba Render antes de disparar.
- **Criar Space** deixa de ser um segundo botão principal e vira ação secundária
  do caderno.
- **Palco vazio vira uma faixa de 108 px** e o cartão "Estilo do projeto" só
  aparece quando há semente (antes do primeiro render ele era um botão
  desabilitado ocupando a primeira tela). A configuração inteira passa a caber
  sem rolar: medido, a linha "Saída" termina em 525 px e o dock começa em 645.
- **"Mais ações"** guarda Abrir no site, Ampliar 2x/4x, variação e voltar à
  vista; ficam à mostra Baixar e Comparar.
- **O resultado rola até a tela** quando chega — e a captura também.
- **Motor e qualidade:** o catálogo virou **v8** e envia `engines[].description`;
  o cartão carrega só o NOME (grade 2×2 quando o Orion está liberado, igual à
  decisão da PR #203 no web) e a linha embaixo explica, mudando com a seleção;
  resolução única vira linha com o preço; a linha "Saída" passou a dizer
  "Quasar 2K · 20 nodes". `CATALOG_MIN_VERSION` subiu pra 8 — cache v7 em disco
  não tem descrição e seria servido por até 6 h.
- **Campo de opção única some.** Com Segmento "Preservar Original", "Espaço"
  mostrava uma pílula sozinha e imóvel; "Elementos na cena" vinha vazio.
- **As abas não mudam mais de forma.** Eram duas antes do primeiro render e
  quatro depois; agora as quatro ficam sempre, com Editar e Animar
  desabilitadas dizendo "Gere um render primeiro".
- **O Sol deixa de ser stepper cego.** Eram cinco estados avançando um por
  clique, sem lista: achar "golden" custava quatro cliques às cegas. O botão
  abre a folha Luz, onde os cinco estão à vista; o estado ligado continua no
  próprio botão.

### O .rbz tinha drifado da fonte

O `.rbz` publicado (`public/downloads/` e `dist/`) estava atrás do código desde
a PR #191: o `isPreserved` dos resumos nunca foi reempacotado, então em campo o
dock ainda dizia "Preservar Original · Preservar Original" — o painel que o
repositório descrevia não era o que rodava. Como a `VERSION` não mudou junto, o
aviso de versão da própria 1.0.4 não tinha como detectar. Os dois `.rbz` foram
regerados nesta versão e conferidos byte a byte contra `sketchup/`.

## O que mudou na 1.0.4 — os quatro primeiros da varredura

Varredura de 13 concorrentes (set/2026) apontou que o que mais dói não é
faltar recurso: é recurso pronto que não chega. Os quatro primeiros itens do
ranking destravam coisa que já existia.

### Aviso de versão

Distribuímos `.rbz` FORA do Extension Warehouse: não há atualização
automática, e quem instalou uma vez ficava naquela versão pra sempre. O
catálogo virou **v7** e devolve `pluginLatest {version, path, note}`; o Ruby
compara com a própria `VERSION` e emite `pluginUpdate` UMA vez por sessão. O
painel mostra aviso brando com botão de baixar — nunca bloqueia, nunca por
cima de geração em andamento. A versão publicada passou a viver em
`lib/sketchup/plugin-release.ts`, lida pela página e pelo catálogo: já drifou
duas vezes (página em 0.4.0 com `.rbz` 0.5.0; `EXTENSION.version` preso em
0.2.0).

### Inserir elemento no Editar

O servidor declara quatro ações (`lib/edit-v3/types.ts`) e o Ruby liberava
três. `insert_element` entrou na lista branca com a regra do servidor:
**exige máscara E instrução** — a área diz onde, o texto diz o quê
(`REQUIRES_MASK`). O painel espelha o gate, e `request_edit` recusa antes do
POST quando o upload da máscara falhou (ela sobe como `:optional`, então sem
essa checagem o usuário levava um erro que se contradizia).

### Salvar o caderno num clique

Tirar 8 imagens do lote era um `savepanel` por imagem. Agora um botão grava
todas em `<pasta do .skp>/spacenode-renders/`, sem sobrescrever, com progresso
e notificação nativa — o mesmo tratamento que o vídeo já tinha. `download_to_file`
ganhou `on_finish`: sem ele, uma falha no meio do caderno abriria uma aba do
navegador por imagem. `unique_path` deixou de ser só `.mp4`.

### Retomar o lote de onde parou

Saldo ou sessão caindo no meio matava o caderno inteiro. O contexto passou a
guardar as cenas que falharam **e a que estava em voo**; `@batch_pending`
sobrevive ao fim do lote e o botão "Retomar N cenas" regera só o que faltou.
Quando o motivo foi saldo, aparece "Comprar Nodes" ao lado.

Fatos que a revisão adversarial (81 agentes, 12 achados confirmados de 25)
obrigou a acertar, e que valem pra qualquer mexida futura no lote:

- **A semente viaja com a pendência.** `ctx[:payload]` não carrega o
  `shared_seed`, que nasce do primeiro resultado — retomar sem ele daria
  cenas que não combinam com as já pagas, justamente o que o lote promete.
- **`current_entry` só é resolvida quando a cena entrega ou falha.**
  `process_next_scene` tira da fila ANTES de `ensure_fresh_session`; se a
  renovação falha ali, a cena não estava na fila nem em `failed_entries` e
  sumia. Mas somá-la sem guarda faria o término NORMAL devolver a última cena
  boa como pendente e recobrá-la — por isso `finish_generation` e o ramo de
  cena inexistente zeram a entrada.
- **A pendência só é limpa quando o lote recomeça de verdade** (dentro da
  continuação de `ensure_fresh_session`), senão um clique em Retomar com
  sessão morta apagava a pendência pra sempre.
- **A retomada herda os resultados anteriores** (`opts[:results]`), senão
  "Salvar as imagens" gravaria só o pedaço retomado.
- **A pendência é amarrada ao modelo** (`guid`, `path` como reserva):
  retomar noutro `.skp` geraria e cobraria cenas do projeto errado.
- **Todo caminho de erro do salvar termina em `batchSaveDone`**, e o painel
  destrava `batchSaving` no evento `error` — uma recusa que só emitisse erro
  deixava Salvar e Retomar mortos pelo resto da sessão.
- **Falha sem status HTTP** (rede caindo depois do POST) pode ter sido
  cobrada: o painel avisa pra conferir o Histórico antes de retomar.

## O que mudou na 1.0.3 — ícones redesenhados

Com a barra na tela, os ícones da 1.0.0 se mostraram pesados: elemento demais
por ícone e traço da espessura do símbolo, que é uma marca e não um ícone de
UI. Redesenhados no mesmo sistema (grade 64, pontas redondas, #333333), com
traço 4,4 no lugar de 5 e curvas de verdade:

- **Capturar** — o visor perdeu a moldura fechada: quatro cantos e o ponto de
  foco. O vazio é que faz um ícone respirar a 24 px.
- **Gerar** — a faísca ganhou lados CÔNCAVOS (quadráticas puxadas pro centro).
  É exatamente isso que separa uma faísca de um asterisco.
- **Nova cena** — a vista com um "+" de crachá FORA do quadro, com um vão
  aberto em volta (`subtract`). Na primeira tentativa o vão comia o canto e o
  que sobrava parecia um retângulo quebrado.
- **Espelho** — virou o arco de um espelho de parede, com um brilho só na
  diagonal; dois riscos viravam mancha no tamanho pequeno.

O gerador ganhou `quad`/`arc` (curva vira polilinha densa antes de virar
distância) e `subtract` para o vão do crachá. A marca ConstellationN não
mudou.

## O que mudou na 1.0.2 — o Espelho conta o que fez

Segundo feedback de campo: "não sei se eu que não estou sabendo usar a
ferramenta espelho", com o painel mostrando **20 espelhos** marcados e o erro
"selecione a FACE, não o grupo". As duas coisas eram a mesma falha nossa: o
gesto (dois cliques pra entrar no grupo) só era ensinado DEPOIS do erro, e
marcar 20 faces de uma vez respondia "Face marcada como espelho" — no
singular, sem contagem. O usuário não tinha como saber que a seleção pegou o
grupo inteiro por dentro.

- **A confirmação diz quantas**: marcar em lote agora responde "20 faces
  marcadas como espelho." Uma face segue com a mensagem de sempre.
- **Aviso do teto**: passando de `MIRROR_MAX_PER_CAPTURE` (6 planos por
  captura, cada um um render extra), a mensagem completa que só os 6
  primeiros entram e manda limpar em Fotografia. O mesmo aviso aparece no
  hint de Espelhos e vidros, que é onde moram "Desmarcar seleção" e "Limpar
  todos".
- **A dica ensina antes**: no hover, "Espelho: dois cliques pra entrar no
  grupo, clique só na FACE do espelho e toque aqui".
- **Com espelho marcado a linha vira caminho**: "20 espelhos — toque pra
  revisar" abre a folha de Fotografia direto na limpeza.

## O que mudou na 1.0.1 — a barra se explica, tema no topo

Feedback de campo do dono, com o 1.0.0 instalado: "não entendi o
funcionamento dos primeiros botões: nivelar, guias, sol". Ícone de 16 px com
rótulo de 9,5 px e `title` não ensinam nada — no CEF a tooltip ainda demora
pra aparecer e some sozinha.

- **Linha de explicação sob a barra de ferramentas.** Parada, ela mostra o
  que está ligado ("Verticais retas · Terços · Sol da captura: Manhã") ou,
  sem nada ligado, o porquê da barra existir: "estes cinco ajustam a CAPTURA
  — e a IA preserva o que ela vê". No hover/foco de cada botão, a frase do
  que aquele botão faz. No clique, o que passou a valer, por 3 s. É a mesma
  linha, então não cresce a interface.
- **Tema no topo**: botão de sol/lua ao lado do Histórico e das Preferências,
  um toque pra alternar claro ↔ escuro (grava em `saveSettings` e sincroniza
  os pills). O seletor de três estados — Automático, Claro, Escuro — segue em
  Preferências, porque "automático" é escolha e não gesto.
- `applyTheme` passou a repintar o ícone, então ele acompanha até a troca
  vinda do sistema operacional quando o tema está em automático.

## O que mudou na 1.0.0 — painel de vidro e Estilo do projeto

### Estilo do projeto (semente travada no .skp)

A queixa nº 1 de quem renderiza com IA não é qualidade de imagem: é
conjunto. Cinco vistas do mesmo apartamento voltam como cinco apartamentos
diferentes — outro piso, outra madeira, outra luz. Veras e Arko expõem
`seed`, mas solta e por render: o arquiteto tem que anotar o número e
recolar a cada geração.

Aqui a semente do render aprovado + os presets que o geraram ficam gravados
**no arquivo**, no dicionário `spacenode`, chave `style`
(`{seed, preset, thumb, renderId, createdAt, version}`):

- **Travar** — um clique no cartão "Estilo do projeto" (habilitado quando há
  render com semente). Dali em diante TODA geração deste `.skp` manda a
  mesma semente: render solto, variação e lote (o `shared_seed` do lote
  passa a nascer do estilo, não da primeira cena gerada).
- **Viaja com o modelo** — quem abre o `.skp` em outra máquina herda o
  estilo. Ao trocar de modelo (`AppObserver#onOpenModel`) o painel reaplica
  sozinho os presets do arquivo e avisa. Gravação em operação transparente:
  não vira passo na pilha de desfazer.
- **Atualizar / Aplicar / Destravar** — "Atualizar" só aparece quando o
  render na tela tem semente diferente da travada; "Aplicar" devolve os
  presets do estilo ao painel; "Destravar" volta a sortear semente por
  render. O dock mostra um ponto verde e "Estilo travado" enquanto vale.
- A miniatura é URL assinada (vence em ~1 h): serve pra sessão e o painel a
  esconde sozinho quando o link morre — o estilo em si não depende dela.

### Painel novo (material de vidro, no estilo Apple)

As 15 seções empilhadas num scroll de 440 px viraram um app:

- **Abas de vidro** (Render · Editar · Animar · Cenas) com polegar que
  desliza; Editar e Animar só aparecem quando há resultado — o mesmo sinal
  que já mostrava/escondia as seções.
- **Folhas (sheets)** que sobem de baixo pros ajustes: Cena, Luz, Fotografia
  e Saída. No lugar de dez seções, quatro linhas com o resumo do que está
  escolhido ("Residencial · Sala de Estar", "Vega · 2K") — o padrão de
  Ajustes do iOS. Histórico e Preferências saíram do scroll e viraram folhas
  chamadas por botões de ícone no topo.
- **Fundo ambiente** — o render (ou a captura) vira papel de parede borrado
  atrás de tudo: é o que o vidro refrata, e o painel assume a paleta do
  projeto. Sem imagem, um degradê neutro segura o mesmo papel.
- **Vidro de verdade** — `backdrop-filter: blur() saturate()` com aresta
  especular no topo e sombra na base, cápsulas com `scale(0.96)` ao
  pressionar e curva de mola `cubic-bezier(.32,.72,0,1)`. CEF sem
  `backdrop-filter` (SketchUp antigo) cai pra superfície sólida via
  `@supports` — legibilidade acima do efeito.
- **Conteúdo rola por baixo do chrome**: topo e dock são fixos e translúcidos.
- **Conta** sai do caminho: com sessão ativa, o cartão de conexão migra pra
  folha de Preferências; desconectado, volta pro topo do painel.
- **Aviso fora das abas** — a faixa de `notice` (erro de sessão, notas de
  condicionamento, recusa do controle de qualidade) ficava dentro da seção
  do Render; agora vive acima das abas e aparece em qualquer uma.
- **Atalho "Animar este render"** virou a aba Animar (era a mesma ação duas
  vezes na mesma tela).
- **Barra de ferramentas no painel**, logo abaixo do preview: Nivelar,
  Guias, Sol, Espelho e Nova cena. São as decisões que se tomam ENQUADRANDO,
  e estavam todas atrás da folha de Fotografia. Mexem no mesmo estado que os
  controles completos, que continuam existindo.

### Toolbar nativa do SketchUp

A barra deixou de ter um botão só. Cinco comandos, com os mesmos PNG 24/48
(SVG só-contorno sai branco na toolbar do Windows) e um submenu em
Extensions → SPACENODE:

- **SPACENODE** — abre o painel.
- **Capturar vista** e **Gerar render** — precisam do painel, porque é ele
  que mostra progresso, custo e resultado: com o painel fechado, o comando
  abre e a ação espera o `ready` (`@pending_toolbar_action`). O Gerar chega
  ao painel como evento `runGenerate`; se o CTA ainda estiver travado
  (catálogo carregando), o painel espera até ~3 s e desiste em silêncio — a
  tela já está na frente dizendo o motivo.
- **Nova cena** e **Marcar espelho** — agem no modelo e valem sozinhas; sem
  painel aberto o retorno vai pra barra de status do SketchUp. Marcar espelho
  fica cinza sem seleção (`set_validation_proc`).
- Ícones gerados por `scripts/sketchup-toolbar-icons.mjs` no mesmo sistema do
  símbolo (grade 64, traço 5, pontas redondas, #333333), com rasterizador
  próprio (distâncias com sinal + supersampling 4×) pra não trazer
  dependência de imagem pro projeto.

## O que mudou na 0.9.0 — Espelhos e vidros

O SketchUp mostra o espelho como uma face chapada e a IA inventa o reflexo
(vira janela, quadro ou painel cinza). Todos os plugins BR de render IA
(Vizai, 1 Click Render, Advanced Safe Frame, Redraw, HEMY, BM IA) resolvem
com a mesma técnica: refletem a câmera da CENA pelo plano da face, capturam
o que ela vê e gravam a imagem como textura na face — amarrada àquela cena,
fica velha ao mover a câmera e precisa de "apagar reflexos".

Aqui o reflexo é **calculado em toda captura, pra câmera daquela captura, e
nunca fica no modelo**:

- **Marcar**: o usuário seleciona a(s) face(s) no SketchUp (entrando no grupo
  com dois cliques) e clica em "Marcar espelho" ou "Marcar vidro" no painel.
  Guardamos `persistent_id` da face + o caminho de instâncias
  (`model.active_path`) em `spacenode/mirrors` (atributo do modelo, JSON) e um
  atributo na própria face. "Desmarcar seleção" / "Limpar todos" desfazem.
  Resolução por `find_entity_by_persistent_id` (2017+); marcações de faces
  apagadas são ignoradas e contadas como "stale".
- **Na captura** (`begin_mirrors`/`end_mirrors`, dentro de
  `start_operation` ABORTADA no ensure): agrupa as faces por plano (uma por
  render), projeta os vértices com a câmera do render (projeção manual —
  fov vertical, `render_camera_params`/`project_pixel`; com Nivelar ligado é
  a câmera temporária nivelada), reflete a câmera pelo plano
  (`reflect_point`/`reflect_vector`), esconde tudo que está atrás ou sobre o
  plano (`hide_behind_plane`: faces/arestas por vértices, instâncias por
  bbox; instância que cruza o plano só é aberta se a definição tem UMA
  instância), renderiza o reflexo (≤ 2048 px), restaura câmera e ocultações,
  recorta a região do espelho (`crop_image_rect`, linhas e colunas via
  ImageRep — o viewport mostra texturas até 1024 px, por isso o recorte),
  cria o material com a textura (alpha 1,0 espelho / 0,45 vidro) e pina na
  face com `position_material` (4 pares = homografia exata do plano; U usa
  `W − px` porque a câmera refletida inverte a horizontal). O render normal,
  o preview e o edge map saem com a face texturizada; `abort_operation`
  devolve o modelo intacto.
- **Prompt**: `modelFacts.mirrors = { count, glass }` → bloco MODEL FACTS diz
  que os espelhos já mostram o reflexo real e proíbe virar janela/quadro.
- **Relatório**: `mirrorsRequested/mirrorsApplied/mirrorReasons` no
  conditioning (atrás da câmera, fora do quadro, pequeno demais, render/
  recorte/pino falhou, > 6 planos, componente repetido cruzando o plano).
- Limites conhecidos: reflexo de reflexo não existe (outro espelho aparece
  chapado no reflexo); sombras caem sobre a textura como em qualquer face;
  componente com várias instâncias cruzando o plano não é aberto (pode
  ocluir o reflexo — relatado); face de definição compartilhada recebe a
  textura em todas as instâncias durante a captura.

## O que mudou na 0.8.0 — Fotografia

Princípio: a IA preserva o que vê. O que dá realismo ao render é a CAPTURA
sair como uma fotografia de arquitetura — proporção escolhida, lente
coerente, olho na altura de uma pessoa e verticais paralelas. Nova seção
"Fotografia" no painel, com HUD vivo da câmera (lente · fov · altura do olho
· inclinação) via `ViewObserver` (debounce de 250 ms em `UI.start_timer`).

- **Proporção** (Livre, 3:2, 4:3, 16:9, 1:1, 4:5, 9:16): aplicada na câmera
  viva (`camera.aspect_ratio=` — o SketchUp desenha a moldura cinza) e
  honrada pela captura: lado maior = alvo da resolução, o outro segue a
  proporção. Vale pra captura manual, geração, lote e Spaces.
- **Lente** (16/20/24/28/35/50 mm): focal equivalente full-frame medida pela
  ALTURA do sensor — `fov_v = 2·atan(12/f)`, gravada com `camera.fov=`
  (o fov do SketchUp é o ângulo vertical). Evita o número inflado do
  `camera.focal_length` (35° viram "57 mm" lá; na foto é um 38 mm). O mesmo
  valor vai pro prompt em `modelFacts.camera.focalLengthMm`.
- **Altura do olho** (Sentado 1,20 m / Em pé 1,60 m): `model.raytest` pra
  baixo a partir do olho acha o piso visível; olho e alvo sobem/descem juntos
  (a direção não muda). Sem piso abaixo → pills desligadas, hint explica. A
  altura medida vai pro prompt (`eyeHeightM`) como pista de escala.
- **Nivelar (2 pontos)**: SÓ NA CAPTURA, sem tocar na vista do usuário. Não
  existe setter de 2 pontos na API — o plugin faz o "shift de lente" na mão:
  câmera temporária nivelada com `fov' = fov + 2·inclinação`, render mais
  alto (`H' = 2·H·tan(h)/(tan(θ+fov/2) − tan(θ−fov/2))`) e recorte da faixa
  que corresponde ao quadro original via `Sketchup::ImageRep` (a ordem das
  linhas do buffer não é documentada — `crop_rows` sonda com
  `color_at_uv`). Preview do painel e edge map usam o MESMO plano (pixels
  alinhados). Limites: inclinação < 0,5° = nada a fazer; > 40° ou fov' > 118°
  = não nivela e avisa (`levelReason` no relatório de condicionamento).
  `twoPoint` no prompt só é verdade quando a captura saiu nivelada ou a
  câmera já estava (`is_2d?` / direção horizontal) — antes o heurístico
  marcava quase toda vista inclinada como 2 pontos.
- **Guias de composição** (Terços, Áurea, Centro, Diagonais): SVG sobre o
  preview do painel e, no SketchUp 2023+, `Sketchup::Overlay` na viewport
  (passivo: não toma cliques nem sai no export), dentro da moldura da
  proporção. Mesma tabela de segmentos nos dois lados.
- Ajustes persistem no estado do painel (`photoAspect/photoLevel/photoGuide`)
  e o painel os reenvia ao Ruby no `state` (`setPhoto`) — o Ruby guarda em
  `@photo` e usa como fallback em qualquer captura sem `:photo` explícito.
- Servidor: `sanitizeModelFacts` aceita `camera.eyeHeightM` (0,2–12 m) e o
  bloco MODEL FACTS ganha "camera X m above the floor".

## O que mudou na 0.7.0 — Animar

- **Animar este render**: take curto (Veo "Cinemático" 4/6/8 s, Kling
  "Rápido" 5/10 s) a partir do render na tela. Tipo (Apresentação, Detalhe,
  Tour só em interior, Reels só em render vertical) → qualidade → duração,
  com o custo em Nodes no pill, no botão e no bloco de saldo insuficiente.
- Fonte do vídeo = `previewUrl` do render (WebP ≤1600 px: cabe nos 15 MB da
  área `animar-source` e basta pra 1080p). O Ruby REVALIDA engine/duração/
  tipo contra o catálogo (`animar`, catálogo v6) antes de enviar; todos os
  valores vão como string (a rota lê com `str()`).
- **O painel não reproduz vídeo**: o CEF do SketchUp não decodifica H.264 em
  nenhuma versão (Trimble: wontfix) e o Animar entrega H.264. Resultado =
  pôster (o render) + "Abrir vídeo" (arquivo local ou navegador), "Salvar
  vídeo…", "Mostrar na pasta", "Ver no site". Sem `<video>`, nem atrás de
  gate.
- Auto-save em `<pasta do .skp>/spacenode-videos/<projeto>-<cena>-<dur>s.mp4`
  (nunca sobrescreve; toggle em Preferências → Vídeos). Modelo nunca salvo →
  aviso brando e o botão "Salvar vídeo…" segue vivo.
- `UI::Notification` nativa quando termina/falha (o arquiteto pode estar
  modelando com o painel atrás).
- Queda de rede depois do POST → reconciliação por `GET /api/video/history`
  (o vídeo mais novo criado depois do início). Cancelar depois do POST avisa
  que pode ter sido cobrado. `reconcile_lost_generation` (renders) passa a
  ignorar `ambient == 'video'`.
- `download_to_file` ganhou `kind: :video` (assinatura `ftyp`), watchdog de
  180 s e falha branda no auto-save; `image_ext_and_mime` (PNG/JPEG/WebP)
  também serve o Ampliar.
- Servidor: `/api/video` e `/api/video/history` aceitam Bearer; a resposta
  ganhou `id`, `totalBalance` e `createdAt`.
- Fora desta versão (próxima): frame final real (falAdapter → Veo
  `first-last-frame-to-video` com `generate_audio:false` e `resolution:'1080p'`
  explícitos; Kling `tail_image_url`) e o "take entre cenas" com a Δcâmera do
  modelo; "Animar todas as cenas do lote"; tira Vídeos no Histórico.

## O que mudou na 0.6.0

- **Fidelidade sempre máxima** — o seletor Máxima/Equilibrado/Criativo saiu
  (web e plugin); o servidor coage. Edge map nativo vai em toda cena sem
  âncora.
- **Tema claro / escuro / automático** (ver seção Tema).
- **Âncora explícita** — o CTA principal sempre gera do zero; "Gerar
  variação deste render" é botão próprio e só ancora se a câmera ainda é a
  do render (2% da distância olho→alvo, 0,5° de FOV); divergiu, gera sem
  âncora e avisa.
- **Dock** — o botão Gerar vive numa barra fixa acima do rodapé, com resumo
  clicável da configuração, custo, saldo e a tecla de atalho (Ctrl+Enter /
  ⌘⏎).
- **Higiene de captura v2** — X-ray, cor por tag, cotas, textos, eixos,
  marca d'água e wireframe/monocromático ficam de fora só durante a captura
  (`RenderMode` texturizado). Cortes NÃO são ligados à força; só o
  preenchimento.
- **Degradação visível** — edge map, materiais e preset de sol que falham
  aparecem no resultado (`conditioning`), com o motivo por material;
  texturas fora de jpg/png nascem desabilitadas na lista.
- **Sessão por etapa** — folga de 10 min e renovação antes de cada cena do
  lote e de cada etapa do Space; falha de renovação dentro de lote/Space
  encerra o contexto (nunca mais overlay preso).
- **Resultado vivo** — URLs assinadas vencem em 1 h; o painel re-assina por
  `renderId` (`GET /api/sketchup/render`) ao restaurar, no erro da imagem
  e antes de qualquer ação; miniatura do Histórico traz o render pro painel.

## Arquitetura

- `spacenode.rb` — só registra a extensão (requisito do Extension Warehouse).
- `spacenode/main.rb` — núcleo: toolbar, painel `HtmlDialog`, captura em alta
  resolução (`view.write_image` até 4096 px), upload direto ao Storage
  (sign → PUT → `sourceKey`) e geração via `/api/generate`. Todo HTTP é
  assíncrono via `Sketchup::Http::Request` (nunca `Thread.new`).
- `spacenode/dialog.html` — painel com paridade do Renderizar: presets
  oficiais (segmento → espaço → iluminação → entorno), motores com custo em
  Nodes, comparador antes/depois, histórico e saldo.
- `spacenode/assets/` — ConstellationN (SVG p/ Windows, PNG p/ macOS) e a
  fonte Geist embarcada.

Rotas web do plugin:

- `/sketchup/connect` — entrega a sessão Supabase ao plugin (nonce de uso
  único ecoado; senha nunca passa pelo plugin).
- `GET /api/sketchup/session` — valida sessão + saldo do pagador.
- `GET /api/sketchup/catalog` — motores, custos e taxonomia de presets
  (fonte única remota; nada de preço hardcodado em Ruby).
- `GET /api/sketchup/render?id=` — reconciliação: recupera um render pago
  quando a conexão caiu no meio da geração.
- `POST /api/uploads/sign` + PUT direto no Storage — a imagem nunca passa
  pelo corpo da função (teto de 4,5 MB da Vercel).
- `POST /api/generate` — geração (aceita `Authorization: Bearer`).

## Sessão e segurança

- O plugin recebe apenas o access token da sessão (expira em ~1h) e o
  renova de forma silenciosa reabrindo `/sketchup/connect` fora da área
  visível — o refresh token nunca sai do navegador embutido.
- O payload da conexão só é aceito se ecoar o nonce gerado pelo Ruby.
- `expiresAt` ausente conta como sessão vencida (nunca "válida pra sempre").
- API base aceita apenas HTTPS (HTTP só em localhost).

## Tema (claro / escuro / automático)

O painel tem os mesmos dois temas do app web. Os tokens de `dialog.html` são
espelho EXATO de `app/globals.css` (`:root` = dark, `html.light` = claro) —
se um valor mudar no app, mudar aqui junto. Resolução do "Automático", na
mesma ordem do app quando o device é novo:

1. escolha local no painel (`Sketchup.write_default(PREFERENCES_KEY, 'theme')`,
   mesmo padrão do override de idioma);
2. preferência da conta (`profiles.theme_preference`, entregue por
   `GET /api/sketchup/session` como `theme`);
3. tema do sistema operacional (`prefers-color-scheme` no CEF);
4. escuro.

Anti-flash: o último tema resolvido fica em `localStorage('spn-theme')` e um
script inline no `<head>` aplica `html.light` antes do primeiro paint; o
estado do Ruby chega depois do `ready` e corrige se preciso.

Cores que NÃO seguem o tema, de propósito: véus sobre imagem (`--scrim`,
`--scrim-strong` e os textos do overlay de geração), o pincel verde da
máscara sobre o render, e o preto/branco do canvas que vira o PNG da máscara
enviado ao servidor.

## Compatibilidade

SketchUp 2021+ (gate em runtime). Testado em campo no **2022** (Windows);
alvo de suporte: 2024/2025/2026 (Ruby 3.2.2; HtmlDialog CEF 112/128/137).

## Empacotar

```powershell
npm run package:sketchup
```

Gera `dist/spacenode-sketchup.rbz` (zip com separadores `/`, compatível com
o SketchUp do macOS). Instalação: `Window > Extension Manager > Install
Extension`.

> Antes de distribuir fora do repo: assinar o `.rbz` no Extension Signature
> Portal (https://extensions.sketchup.com/extension/sign) — usuários com a
> política "Identified Extensions Only" não carregam extensão sem assinatura.

## Desenvolvimento local

1. Suba o app: `npm run dev` (porta 3000 — o login Google só funciona nela).
2. No painel do plugin, abra "Conexão avançada" e aponte o servidor para
   `http://localhost:3000`.
3. Para carregar a extensão direto do repo, no Ruby Console do SketchUp:

```ruby
$LOAD_PATH.unshift 'C:/Users/Pisoni/spacenode-sketchup/sketchup'
require 'spacenode/main'
```

(Depois de alterar o Ruby, reinicie o SketchUp e rode o `require` de novo —
`require` não recarrega arquivo já carregado.)

## Contrato enviado para geração

O painel envia pro Ruby: `prompt`, `projectType`, `segment`, `environment`,
`lighting`, `background`, `sceneElements[]`, `engine`, `resolution`,
`useAnchor`, `seed`. `fidelityLevel` é sempre `maximum` (o Ruby fixa e o
servidor coage — o seletor Máxima/Equilibrado/Criativo foi descontinuado em
2026-09-03 porque os níveis relaxados deixavam a IA alucinar no projeto). O Ruby captura a vista (PNG, lado maior
2048–4096 px conforme a resolução), sobe via `sourceKey` e monta o corpo do
`/api/generate`. Em variações (`useAnchor`), o render anterior vai como
`anchorUrl`. `geometryLock`/`fidelityMode` não são enviados (são no-ops na
rota — decisão documentada no plano mestre 2026-09-01).
