# Fila de Reels orgânicos — 12/09 a 19/09/2026

Montada em 11/09, **refeita no mesmo dia** depois que o dono apontou o problema: a primeira
versão colocava quatro tutoriais na fila, e eles mostram uma interface que não existe mais.

**Nada foi publicado.** Página de revisão com os vídeos tocáveis:
<https://claude.ai/code/artifact/e1455af1-9ef9-4ff9-87b3-d6a1b80c762b>

## Por que esta janela

O teste A/B pago roda **exatamente de 12/09 a 19/09** comprando *visitas ao perfil*
(R$ 40/dia). Quem clica cai na grade do Instagram — ela é a landing page dessa verba.
Postar não custa nada e é a alavanca mais barata de conversão de dinheiro que já está saindo.

## A regra que saiu daqui

**Reel que mostra tela do produto tem prazo de validade; Reel que mostra resultado não.**
Os seis tutoriais foram gravados em 08 e 09/09 e envelheceram em 24 h:

| Mudou em | O quê | Quebra qual peça |
|---|---|---|
| 09/09 | Plugin 1.0.0→1.0.3: painel de vidro, toolbar nativa, ícones novos (PRs #181–#185) | os 2 do plugin |
| 10/09 | `/app` inteiro vira vidro (PR #187) | os 4 do app |
| 10/09 | Quasar vira padrão de todos a 20 nodes → 80 grátis = **4 imagens**, não 8 | Renderizar, Primeiros 80 nodes |
| 10/09 | Cena preserva Segmento e Espaço por padrão (PR #191) | Renderizar |
| 10/09 | Editar V4 absorve o Finalizar (PR #199) | Editar |

Publicar tela velha para quem o anúncio manda direto para dentro do app é pior do que não
publicar: a pessoa assiste, abre a ferramenta e encontra outra coisa.

## A fila — só peças de resultado, nenhuma interface

Todos 1080×1920, 30 fps, prontos. Caminho relativo a `marketing/output/`.

| # | Data | Reel | Pilar | Dur. |
|---|---|---|---|---|
| 1 | 12/09 sáb | `2026-09-05-reel-voce-ve-o-cliente-ve` | Transformação | 5,9s |
| 2 | 13/09 dom | `2026-09-05-reel-isso-saiu-de-um-print` | Transformação | 6,7s |
| 3 | 14/09 seg | `2026-09-05-reel-todo-arquiteto-ja-mandou` | Transformação | 5,6s |
| 4 | 15/09 ter | `2026-09-05-reel-sim-e-o-mesmo-projeto` | Transformação | 7,3s |
| 5 | 16/09 qua | `2026-09-05-reel-quantas-vistas-cabem` | Educação | 7,8s |
| 6 | 17/09 qui | `2026-09-05-reel-cliente-nao-le-planta` | Educação | 7,0s |
| 7 | 18/09 sex | `2026-09-05-reel-de-manha-ou-a-noite` | Transformação | 5,5s |
| 8 | 19/09 sáb | `2026-09-04-reel-um-print-cinco-climas` | Transformação | 10,0s |

Cada tutorial removido foi trocado por uma peça que entrega **a mesma mensagem pelo
resultado**: Renderizar → "você vê o projeto / o cliente vê a casa"; Spaces → "quantas vistas
cabem numa reunião"; Editar → "de manhã ou à noite: os dois".

A proporção do BRIEF (40% transformação / 25% educação / 20% produto em ação) fica sem a
fatia de produto em ação esta semana. Não é escolha: é o que está válido. As legendas
completas estão na página de revisão.

Reserva, todas sem interface: `isso-nao-e-foto`, `um-banheiro-tres-cameras`,
`adivinhe-o-antes`, `drone-nada-sai-do-lugar`.

## Vencidos — precisam ser regravados

| Peça | O que quebrou | Custo de regravar |
|---|---|---|
| `2026-09-09-reel-uso-spaces` | só o visual | baixo — mesmo roteiro, captura nova |
| `2026-09-09-reel-uso-animar` | só o visual | baixo — mesmo roteiro, captura nova |
| `2026-09-09-reel-uso-renderizar` | visual + preço + folha de Cena | médio — reescrever a fala do preço |
| `2026-09-09-reel-uso-editar` | visual + o fluxo mudou (V4 absorveu o Finalizar) | alto — decidir antes o que ensina |
| `2026-09-08-reel-tutorial-instalar-o-plugin` | painel anterior ao 1.0 · + gate do `.rbz` | médio — exige SketchUp aberto |
| `2026-09-08-reel-tutorial-primeiros-80-nodes` | preço errado em dois eixos · + gate do `.rbz` | médio — exige SketchUp aberto |

**Como regravar os do app:** sessão de captura com o dono logado
(`capturar.mjs --login --chrome`, 900×1400 — Chromium headed não abre no app empacotado).
Gera render de verdade, então **gasta nodes**. Os do plugin exigem o SketchUp na máquina do
dono com o 1.0.4 instalado.

## Fora da fila por autorização

Projetos de muda arquitetura, Paula Miolla, Nathalia Costa e Bruna Plentz: liberados só para
a landing, orgânico segue ❓ em `AUTORIZACOES.md`. Nenhum Reel desta fila usa essas imagens.

## Registro de publicação

Nada no repo registra o que já foi ao ar no @spacenode.app. Esta tabela passa a ser esse
registro — marque ao publicar.

| # | Data | Publicado? | Views 24h | Perfil ganho |
|---|---|---|---|---|
| 1 | 12/09 | ☐ | | |
| 2 | 13/09 | ☐ | | |
| 3 | 14/09 | ☐ | | |
| 4 | 15/09 | ☐ | | |
| 5 | 16/09 | ☐ | | |
| 6 | 17/09 | ☐ | | |
| 7 | 18/09 | ☐ | | |
| 8 | 19/09 | ☐ | | |

Em 19/09 dá para cruzar esta coluna com o custo por visita ao perfil de cada célula do teste
pago e separar o que veio de anúncio do que veio de feed.
