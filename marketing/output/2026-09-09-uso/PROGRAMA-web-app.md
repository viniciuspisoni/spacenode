# Reels de uso do web app — 2026-09-09

Cinco peças, 1080×1920, 30 fps, H.264, **sem áudio** (a música entra no app do Instagram).
Specs em `marketing/specs/2026-09-09-uso/`. Capturas reais do app logado, sem gastar node
nenhum: o `capturar.mjs` pula todo passo marcado `"paga": true`.

| Reel | duração | ensina |
|---|---|---|
| `renderizar` | 15,6 s | subir o print → taxonomia (sem prompt) → motor e saída → preço no botão → antes/depois real |
| `editar` | 16,1 s | ação → descrever em português → laço para precisão → custo antes de aplicar |
| `animar` | 15,5 s | cinco tipos → "Reels de Projeto" já deixa 9:16 e 6 s → 210 nodes → fecha com vídeo real |
| `spaces` | 15,1 s | Vista Mestre → 8 nodes de DNA → DNA travado → as próximas vistas nascem dele |
| `ampliar` | 15,2 s | render aprovado → a plataforma recomenda o modo → 2×/4×/8× → custo antes do clique |

## O que a auditoria adversarial pegou

Cada spec foi escrito por um agente e **reprovado por outro**, que abriu cada recorte com
ffmpeg e olhou frame a frame. Nove problemas de gravidade ALTA, todos corrigidos em disco:

- **Editar** afirmava *"o resto da imagem não se mexe."* — claim absoluto e falso. A própria UI
  do produto diz "Preservamos câmera, proporções e enquadramento ao máximo — pode haver pequenas
  variações". A cartela virou *"muda o que você pediu, não o projeto."*
- **Renderizar** ensinava, em duas cenas, fatos que a tela não mostrava: a copy citava
  "JPG · PNG · até 15 MB" sobre um still onde essas strings não existem, e nomeava "entorno"
  num recorte que parava antes da seção ENTORNO. Recortes trocados e conferidos visualmente.
- **Spaces** tinha quatro: um número sem referente, um recorte que escondia metade do que a copy
  prometia, conteúdo cortado nas bordas pelo Ken Burns e um campo de formulário decepado.
- **Ampliar** tinha o botão "Ampliar Imagem" preenchido em `#1a1a1a` — exatamente a cor que
  `bg: "dark"` pinta no fundo do quadro. O botão sumiria. E um recorte de custo entrava 33 px
  dentro do botão.
- Uma margem de privacidade de **um pixel**: o recorte do botão do Renderizar terminava na linha
  2519 e a frase "seu saldo dá para ~313 renders" começa na 2520. Não vazava, mas qualquer
  reajuste de 2 px publicaria o saldo. Recorte recuado para 2499.

## Dois defeitos que a auditoria NÃO pegou, e por quê

**1. Sobreposição de cartelas — bug do kit, não do spec.** No Spaces, no frame exato da troca,
duas cartelas apareciam juntas e ilegíveis. Causa: `overlay=enable='between(t,a,b)'` é inclusivo
nos dois extremos, então uma cartela que termina em 7,3 s e outra que começa em 7,3 s ficam as
duas ligadas naquele frame. Corrigido em `reel-kit.mjs` para intervalo semiaberto
(`gte(t,from)*lt(t,to)`). **Afeta todo Reel já publicado com cartelas coladas** — o do plugin
inclusive; vale re-renderizar quando for conveniente.

O verificador não pegou porque a instrução dele era rodar só `--plan`, que imprime tempos mas não
renderiza. Foi uma escolha de custo minha, e esse foi o preço dela.

**2. Verde demais.** O `REEL-KIT.md` permite uma palavra verde *por card*, e a auditoria aprovou
por essa régua. Mas o `BRIEF.md` manda usar verde "com parcimônia: CTAs, números, 1 palavra-chave",
e o slate tinha saído incoerente: dois Reels sem verde nenhum, um com três (`{português}`,
`{laço}`, `{antes}` — nenhum deles número nem CTA). Padronizado em no máximo **um por peça**,
preferindo o número: `{20}` no Renderizar, `{antes}` no Editar, `{recomenda}` no Ampliar;
Animar e Spaces seguem sem verde. O filme usa exatamente um (`{80}`).

## Composição — o ponto fraco honesto

O **Ampliar** é o mais fraco dos cinco: três cenas são tiras finas de UI (a linha de custo, o
botão) com muito preto em volta. São legíveis e honestas, mas não são impactantes. O conserto é
recortar uma região mais alta em volta de cada controle, para o recorte chegar perto de 4:3 em vez
de 6:1 — meia hora de trabalho por peça, não um problema de ferramenta.

**Animar** e **Renderizar** são os dois mais fortes: painéis grandes, texto legível, número real
queimado no pixel da interface.

## Pendências

- **Uma incoerência que exige recaptura:** no Renderizar, o painel mostra "Golden Hour"
  selecionado, mas o render do desfecho (`renders/depois/casa.jpg`) é céu azul de meio-dia. Quem
  cruzar as duas cenas vê. Saídas: recapturar o painel com "Diurno", ou aceitar (a cena vende a
  lista, não a seleção, e o destaque fica 3,2 s no meio de ~30 pílulas).
- `marketing/BRIEF.md` tem dois dados errados que farão a próxima peça errar: lista "Quasar 4K"
  (não existe) e descreve o Geometry Lock como slider (descontinuado). Já sinalizado à parte.
