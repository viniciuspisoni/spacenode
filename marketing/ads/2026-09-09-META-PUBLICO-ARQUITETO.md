# Meta Ads — público certo: arquitetos, designers de interiores e quem usa SketchUp

Data: 2026-09-09 · Conta `act_10202044711098425` · Orçamento Meta confirmado: **R$ 40/dia** (14/09 → 13/10)
Complementa `2026-09-08-DIAGNOSTICO-E-SETUP-TRAFEGO-PAGO.md`. Arquivos gerados por `setup-2026-09/build.mjs`:
`meta-01-bulk-import.csv` (estrutura, criativos, copy) e **`meta-02-segmentacao.csv` (checklist de público, item a item)**.

## 0. Resumo

As campanhas anteriores trouxeram seguidor genérico porque a Meta entregou para quem era **mais barato de clicar ou
seguir**, não para quem projeta. Quatro coisas mudam a partir de agora, todas dentro dos R$ 40/dia:

| Mudança | Antes | Agora |
|---|---|---|
| Quem vê o anúncio | Advantage+ público (interesses viram "sugestão") | **Público original**, duas camadas obrigatórias: *profissão* **E** *ferramenta 3D/CAD* |
| Onde aparece | Instagram + Facebook | **Só Instagram** (Reels, Feed, Stories). Facebook Reels é onde vinha o público leigo mais barato |
| Idade | 24–55 | **24–50** na prospecção (quem paga R$ 89/mês); 22–55 na de seguidores |
| Seguidores | efeito colateral de tráfego barato | Campanha própria de **R$ 8/dia** só para quem **já assistiu nossos vídeos** e tem sinal de profissão |
| Criativo | render bonito (atrai todo mundo) | Gancho nos 2 primeiros segundos **exclui** quem não usa SketchUp (ver §5) |

Estrutura final: `SN_META_PROSPECCAO_ARQUITETO` (Tráfego → visualizações de LP, R$ 16 + R$ 16) +
`SN_META_SEGUIDORES_ARQUITETO` (Engajamento → visitas ao perfil do Instagram, R$ 8). Tudo nasce **pausado**.

## 1. Por que veio seguidor genérico

1. **Advantage+ público** com objetivo de tráfego: a Meta trata interesses como sugestão e expande para quem clica
   barato. Em 2026 isso é regra para Leads/Vendas; em Tráfego e Engajamento ainda dá para desligar.
2. **Sem sinal de cadastro** (não há Pixel/CAPI): o algoritmo só aprendeu "quem clica", nunca "quem se cadastra".
3. **Facebook Reels** no mix: CPM baixo, público mais velho e leigo ("IA para decorar minha casa").
4. **Criativo universal**: render fotorrealista bonito agrada qualquer pessoa. O que filtra é mostrar a tela do
   SketchUp e falar com o arquiteto pelo nome nos primeiros 2 segundos.

Contexto que limita a solução: os interesses **SketchUp, Revit, Lumion, Enscape, V-Ray, Twinmotion e D5 não existem
mais** na segmentação (consolidação de 15/01/2026) e **exclusão por interesse foi removida**. Sobram interesses
amplos (Arquitetura, Design de interiores, CAD, 3ds Max), dados demográficos (áreas de estudo, alguns cargos) e os
públicos de 1ª parte da própria Meta (quem interagiu com o @spacenode.app, quem assistiu nossos vídeos).

## 2. Como o público fica (4 camadas)

**Camada 0 — base.** Brasil ("pessoas que moram"), Português (Brasil), 24–50, público **original** (botão
"Mudar para opções de público original"), "Alcançar pessoas além das suas seleções" **desmarcado**.

**Camada 1 — profissão (OU entre os itens).** Interesses: Arquitetura · Design de interiores · Arquitetura e
Construção · Estilo arquitetônico · Arquitetura de interiores · Paisagismo · Urbanismo. Educação → áreas de
estudo: Arquitetura e urbanismo · Design de interiores · Engenharia civil. Trabalho → cargos: Arquiteto ·
Designer de interiores · Projetista (se ainda existirem).

**Camada 2 — ferramenta (E, via "Restringir público").** Desenho assistido por computador · 3ds Max · AutoCAD ·
Autodesk · Rhinoceros 3D · Archicad · Modelagem 3D · Computação gráfica 3D · Renderização 3D · Building information
modeling. É o melhor proxy de "usa SketchUp" que a Meta ainda oferece: quem tem interesse em software 3D/CAD **e**
em arquitetura é, na prática, quem modela.

**Camada 3 — tamanho.** Alvo de 300 mil a 2 milhões. Abaixo de 150 mil, tirar cargos/educação; acima de 3 milhões,
a camada 2 não restringiu (conferir se caiu em "incluir" em vez de "restringir").

**Camada quente (só na campanha de seguidores).** Públicos personalizados de fonte Meta, sem nada do site e sem
LGPD: "Instagram — todas as pessoas que interagiram com esta conta profissional, 365 dias" e "Vídeo — assistiram
≥ 50% de qualquer vídeo, 365 dias". Quem assistiu metade de um Reel que mostra o SketchUp já se auto-selecionou.

Lookalike continua fora: < 100 pagantes e subir e-mails exige a cláusula 7 reescrita.

## 3. Estrutura (R$ 40/dia)

| Campanha | Objetivo / meta | Conjunto | R$/dia | Público | Destino | Anúncios |
|---|---|---|---|---|---|---|
| `SN_META_PROSPECCAO_ARQUITETO` | Tráfego → visualizações da página de destino, ABO, limite R$ 1.000 | `_RENDER` | 16 | Camadas 0+1+2 | `/lp/print-do-sketchup` | DRONE, PISCAFACHADA (COPY01), DUASREUNIOES (COPY02) |
| idem | idem | `_PLUGIN` | 16 | Camadas 0+1+2 (duplicar) | `/sketchup` | PLUGINRENDER, PLUGINNOSU (COPY03), TRESCENAS (COPY04) |
| `SN_META_SEGUIDORES_ARQUITETO` | Engajamento → local Instagram → **maximizar visitas ao perfil**, limite R$ 250 | `_QUENTE` | 8 | Quente (OU) restringido pela camada 1 | perfil @spacenode.app | DRONE, PLUGINNOSU (COPY05) |

Se um dia a verba cair para R$ 30, sai o `_PLUGIN` primeiro; a campanha de seguidores só sai se a amostra semanal
(§6) mostrar seguidor genérico.

## 4. Passo a passo no Gerenciador (≈ 40 min, uma vez)

1. **Públicos** → Criar público personalizado → *Conta do Instagram* → "todas as pessoas que interagiram", 365 dias,
   nome `SN_QUENTE_IG_365`. Repetir com *Vídeo* → "assistiram pelo menos 50%" → marcar todos os vídeos → 365 dias,
   nome `SN_QUENTE_VIDEO50_365`. Anotar o tamanho de cada um.
2. **Importar** `meta-01-bulk-import.csv` (Criar → Importar em massa). Ela traz campanhas, conjuntos, verba, idade,
   idioma, posicionamentos só Instagram, `Advantage Audience = No`, vídeos, copy, CTA e UTMs. Ela **não** traz
   interesses nem públicos personalizados (a planilha só aceita IDs numéricos).
3. Abrir o conjunto `SN_META_PROSPECCAO_ARQUITETO_RENDER` e seguir `meta-02-segmentacao.csv` linha a linha
   (camadas 0 → 3). Itens marcados "incluir se existir": buscar exatamente com o nome da planilha; se a busca não
   achar, pular e anotar na coluna observação.
4. Conferir o tamanho estimado (camada 3), salvar, e **copiar o público** para `_PLUGIN` (menu do conjunto →
   "Usar público existente" ou duplicar o conjunto e trocar destino/anúncios).
5. Abrir `SN_META_SEGUIDORES_ARQUITETO_QUENTE`: incluir os dois públicos `SN_QUENTE_*`, restringir pela camada 1,
   posicionamentos só Instagram. Se a importação recusar o objetivo Engajamento/perfil, criar a campanha à mão:
   Engajamento → Local de conversão *Instagram* → meta "Maximizar o número de visitas ao perfil do Instagram".
6. Em cada anúncio: conta do Instagram @spacenode.app selecionada, aprimoramentos Advantage+ creative **todos OFF**
   (música da Sound Collection pode ficar), prévia de Reels e Feed (o card final não pode cair na faixa de CTA).
7. Publicar com tudo desligado (nasce pausado). Ativar só sexta 11/09 ou segunda 14/09 depois de confirmar em Faturamento
   que o saldo está zerado e o método está verificado (leitura de 08/09 mostrava 7 cobranças falhas; o dono pagou em 08/09).

Se o servidor MCP oficial da Meta (`meta-ads`, já configurado) for autorizado numa sessão interativa (`/mcp`), a
busca de interesses, os tamanhos de público e a criação de tudo isso podem ser feitos por API, sem a interface.

## 5. Criativo como filtro (o que a segmentação não alcança)

- **Segundo 0–2:** tela do SketchUp visível (viewport, barra de ferramentas ou cena) **ou** texto "Você modela no
  SketchUp?". Quem não reconhece a tela rola. Os seis vídeos escolhidos já abrem no modelo; conferir no corte `-ad`.
- **Legenda:** começa com a pergunta/qualificador ("Você modela no SketchUp?", "Para arquitetos:") e traz o preço
  (R$ 89/mês). Preço afasta o curioso e não afasta o profissional. Copy atualizada em `build.mjs` (COPY01/02/05).
- **Vocabulário de ofício:** cena, print, planta humanizada, fidelidade ao modelo. Nunca "decore sua casa",
  "transforme fotos", "grátis" como manchete.
- **Campanha de seguidores:** CTA "Visitar perfil do Instagram"; o vídeo termina com o card "um Reel por semana".
  O perfil precisa dizer em uma linha para quem é (bio: "Render com IA para quem projeta no SketchUp").

## 6. Leitura semanal e cortes (segundas, junto com o ritual do painel)

| Sinal | Meta | Corte |
|---|---|---|
| Amostra de 20 seguidores novos (bio com arquitet/design/interiores/CAU/SketchUp/projet) | ≥ 60% | < 40% em 2 semanas seguidas → pausar `SEGUIDORES` e revisar camada 1 |
| Custo por visita ao perfil | ≤ R$ 1,50 | > R$ 3 por 7 dias → trocar criativo |
| CTR de link (prospecção) | ≥ 0,8% | < 0,5% com 5.000 impressões → trocar anúncio pelo reserva (piscina, zoom-cozinha) |
| Frequência 7 dias | ≤ 2,5 (prospecção) · ≤ 4 (quente) | acima → ampliar camada 2 (prospecção) ou reduzir verba (quente) |
| Cadastros por conjunto (painel, UTM) | ≥ 8/semana | 30 cadastros sem ninguém com 10+ gerações → pausar o conjunto |
| Ativação (gerou ≥ 1 imagem em 7 dias) | ≥ 45% | < 25% com 20 cadastros = público errado, não criativo → revisar camadas 1–2 |
| CAC | aprender ≤ R$ 400 · parar > R$ 600 | leitura só em 08/10 e releitura em 45 dias |

Público certo se mede pelo que a pessoa faz depois de clicar (ativação, 10+ gerações), não pelo custo do clique.

## 7. Quando a CAPI entrar (PR #142 + dataset)

Mudar `PROSPECCAO` para Leads → `CompleteRegistration` **obriga** Advantage+ público: as camadas 1–2 viram
sugestão. Nesse momento o que segura a qualidade é (a) o sinal certo (cadastro, não clique), (b) o criativo-filtro
do §5 e (c) excluir `CompleteRegistration` 30 dias. Só migrar com ≥ 8 cadastros/semana chegando no dataset.

## 8. Pendências do dono

1. Confirmar em Faturamento que o pagamento de 08/09 zerou o saldo e que o método consta como verificado.
2. Autorizar o MCP `meta-ads` (`/mcp` em sessão interativa) para eu conferir interesses/tamanhos e montar por API.
3. Bio do @spacenode.app com a linha de posicionamento (§5) antes de ligar a campanha de seguidores.
4. Continuam: verificação Google, cláusula 7, push/migration/merge da PR #142.

Fontes consultadas (09/09): Meta Business Help (colunas do modelo de importação; locais de conversão por objetivo),
Conversios/Linear Design/AdNabu (Advantage+ público vs. original em 2026), Social Media Today/Pixel Movers/CoTask
(consolidação de interesses 15/01/2026, fim das exclusões por interesse), CoreBrief/Jon Loomer (meta "visitas ao
perfil do Instagram" no objetivo Engajamento), AdsUploader (limites da planilha de importação: interesses e
públicos só por ID).
