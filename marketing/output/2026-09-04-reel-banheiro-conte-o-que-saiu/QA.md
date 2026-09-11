# QA — R6 · "conte o que saiu do lugar." (banheiro com jardim vertical)

- **Slug:** `2026-09-04-reel-banheiro-conte-o-que-saiu`
- **Peça orgânica:** `C:/Users/Pisoni/spacenode/marketing/output/2026-09-04-reel-banheiro-conte-o-que-saiu/2026-09-04-reel-banheiro-conte-o-que-saiu.mp4`
  1080×1920 · 30 fps · H.264 · yuv420p · sem áudio · **9,50 s** · 3,81 MB
- **Peça paga:** `C:/Users/Pisoni/spacenode/marketing/output/2026-09-04-reel-banheiro-conte-o-que-saiu-ad/2026-09-04-reel-banheiro-conte-o-que-saiu-ad.mp4`
  mesmas specs · **8,50 s** · 3,39 MB
- **Spec usado:** `spec-src.json` (cópia normalizada em `spec.json`), renderizado com
  `node marketing/scripts/reel-spec.mjs <spec>`. **Não foi re-renderizado nesta rodada** — nenhum
  defeito real encontrado no QA visual.

## Assets (acervo real, nada gerado para o Reel)

| papel | idx | arquivo | dimensão | origem |
|---|---|---|---|---|
| ANTES (print do modelo) | #474 | `assets/0474-render-before.jpg` | 669×856 | job `8ef2b96f`, 2026-04-28 |
| DEPOIS (render) | #473 | `assets/0473-render-after.jpg` | 912×1168 | mesmo job, engine **vega / 2k** |

Mesma câmera, mesmo job. `user_prompt` vazio no banco — por isso a legenda **não** afirma qual
intenção foi escolhida, só que luz e acabamento vieram da intenção definida na geração
(mecânica real do produto: motor, resolução, atmosfera, materialidade).

## Timeline (probe.json)

| t (s) | o que acontece |
|---|---|
| 0,00 | seg0 (#474, `fit: contain`, 1078×1380 @ y=270, kenburns 1,00→1,03, brightness −0,30). Faixas `#1a1a1a` em 0–270 e 1650–1920. Hook + bandScrim entram **em corte** no frame 0 |
| 1,50 | começa o `wipedown` de 3,0 s com régua branca de 6 px |
| 2,50 | hook sai **em corte** (o wipe ainda corre — o texto nunca é atravessado pela régua) |
| 4,50 | fim do wipe; a partir daqui só #473 (kenburns 1,01→1,0633) |
| 5,00 | entra a resposta "nada. / [mesma câmera, mesma esquadria.]" + bandScrim próprio |
| 7,80 | resposta sai em corte; entra o fechamento (gradiente + logo monocromático + pílula "Veja no seu próprio projeto →" + microcopy) |
| 9,50 | fim — a peça loopa de volta no print escuro com a pergunta |

Na versão paga: hold do "nada." de 4,80 a 6,50 s e fechamento de 6,50 a 8,50 s (seg1 de 7 s,
kenburns 1,01→1,0567). Mesmo hook desde o frame 0.

## O que foi conferido, frame a frame

Folha: `qa-sheet.jpg` (11 frames). Recortes ampliados em `qa-zoom/`.

- **t=0,50 s** — hook "conte o que saiu do lugar." sobre a faixa de revestimento do print quase
  preto, com bandScrim próprio. Legível; 6 palavras, minúsculas, ponto final, sem verde.
  Topo do texto em y≈452 → dentro da zona segura (>220).
- **t=1,70 s** (`qa-frames/t1.70s.png`) — a régua branca está em y≈128, ou seja **dentro da faixa
  `#1a1a1a` do topo**, antes de entrar na imagem. Investiguei: em `lib/reel-kit.mjs` a régua é o
  último overlay do grafo, então passa por cima das faixas. **Não é defeito** — a linha percorre o
  quadro inteiro e lê como régua varrendo a peça; sem isso ela nasceria no meio da imagem. Vale o
  mesmo na saída (4,14–4,50 s, faixa de baixo). Fica registrado porque quem reaproveitar o kit vai
  reencontrar esse comportamento.
- **t=2,00 / 2,40 s** — a régua cruza a faixa de revestimento logo **abaixo** do hook; texto
  inteiro, sem corte, sem ser atravessado. Contraste ok: do lado "depois" a faixa já está morna e
  o bandScrim segura o branco.
- **t=3,00 s — o frame decisivo do wipe.** Ampliei a costura em `qa-zoom/_z_jamb_t3.png` (5×, jamba
  direita) e `qa-zoom/_zoom_wipe3.png`: o montante vertical da esquadria, a jamba direita e o vidro
  **continuam na mesma coluna** cruzando a linha do wipe — desalinhamento ≈1 px no quadro real. Os
  kenburns dos dois ramos foram calculados para coincidir aqui (ambos em 1,020 em t=3,0 s) e
  coincidem. É a prova visual que a peça promete.
- **t=4,00 s** — régua saindo pelo piso, quase no fim. Sem flash claro no corte: a transição é
  wipe, não fade, e não há frame branco em ponto nenhum da peça.
- **t=4,70 s** — imagem limpa, sem texto, entre a saída do hook e a entrada da resposta. Nunca há
  hook e resposta na tela ao mesmo tempo.
- **t=5,50 / 7,70 s** (`qa-frames/t5.50s.png`) — "nada." em branco peso 500 + segunda linha em
  cinza terciário (sintaxe `[...]`), y≈420–555, dentro da zona segura, uma linha só, sem quebra e
  sem encostar nas bordas (margens ≈90 px). Legível sobre a parede morna.
- **t=8,50 / 9,40 s** (`qa-frames/t9.40s.png`) — fechamento: logo monocromático, pílula branca
  "Veja no seu próprio projeto →" e microcopy "80 nodes grátis · sem cartão · em português". Base
  da microcopy em y≈1590 → **dentro** do limite de 1600, com folga de ~10 px. É o ponto mais
  apertado da peça: não mexer no `top: 1372` do card `closing` sem refazer essa conta. Sem URL na
  arte. O fechamento é overlay sobre o render, sem card preto — o loop reinicia no print.
- **Verde:** nenhum. A regra é "no máximo uma palavra verde por card"; a peça não usa nenhuma — a
  faixa `#1a1a1a`, o branco e o cinza terciário já são a linguagem da landing.
- **Banda:** os dois stills entram em `fit: "contain"` (1078×1380), proporção 0,78 preservada dos
  dois lados. Nada esticado, nada cropado.

## Checagem de fato (o que a legenda pode afirmar)

Ampliei o forro nos dois lados: `qa-zoom/_z_ceiling_before.png` (frame do ANTES, +0,22 de brilho
para conseguir ler o print escuro) × `qa-zoom/_z_ceiling_after.png`.

- **Corrigi um erro de fato que estava na legenda anterior.** Ela dizia "a única coisa que não
  estava lá é a sanca no forro". Falso: **a sanca já está modelada no print** — o rebaixo, o degrau
  perimetral, a luminária redonda e o chuveiro de teto retangular aparecem no ANTES, nas mesmas
  posições. O que o render acrescentou foi **luz** na sanca, não a sanca. A legenda nova diz
  exatamente isso, e o claim fica mais forte, não mais fraco.
- Confirmado no ANTES e mantido no DEPOIS: bacia suspensa, coluna de ducha e misturador na parede
  esquerda, porta-papel, nicho, esquadria de duas folhas com montante central, as duas lajotas
  irregulares sobre a faixa de seixos, o piso à frente, as juntas do revestimento da faixa alta e
  **as gotas do chuveiro de teto** (visíveis como pontilhado no print).
- **Mudou de verdade:** o acabamento (revestimento escuro e metais pretos → tons de bronze) e a
  luz. A legenda assume isso em texto corrido ("luz e acabamento vieram da intenção definida na
  geração; a geometria veio do modelo") em vez de deixar o cético descobrir sozinho. Nunca dizer
  "nada mudou" nem "material preservado": o texto em tela é escopado ("mesma câmera, mesma
  esquadria") e sobrevive à inspeção quadro a quadro.

## Decisão sobre a versão paga

**Mantida como está, sem re-render.** Conferi `.../-ad/qa-sheet.jpg` (7 frames): mesmo par, mesmo
wipe, mesma costura em t=3,00 s, hook desde o frame 0, resposta em 4,80–6,50 s, fechamento em
6,50–8,50 s. 8,50 s ≤ 15 s do teto de anúncio.

Uma ressalva assumida: o card de fechamento da versão paga **mantém a pílula "Veja no seu próprio
projeto →"**, que duplica o botão SIGN_UP do Meta. Optei por manter — a pílula vem com o logo e com
o microcopy "80 nodes grátis · sem cartão", que é o que de-arrisca o clique, e fica em y≈1466–1544,
bem acima da barra de CTA do Reels patrocinado. Se o dono preferir sem, a alternativa é um spec-ad
com o `closing` reduzido a logo + microcopy; custa ~1 min de re-render.

## Ressalvas e gating

1. **Origem do print não confirmada.** O banco não guarda a ferramenta de origem e o `user_prompt`
   está vazio. Por isso a legenda diz **"o print da vista, o modelo, uma referência"** e nunca
   "exportei do SketchUp". A hashtag `#sketchup` é de alcance, não é claim de origem. Se o dono
   confirmar SketchUp, dá para trocar a frase de palavra-chave por "renderizar SketchUp"; hoje ela
   usa "Visualização arquitetônica", que é verdadeira sem depender disso.
2. **Autoria do modelo.** Precisa do aval do dono de que o modelo é dele (ou do cliente, com
   permissão) antes de publicar. O rótulo do banco para este ambiente é "Suíte Master" e está
   **errado** (há ducha e chuveiro de teto): nunca usar esse rótulo, nunca "lavabo", nunca
   "exaustor".
3. **Sem número inventado.** Só "gerado em minutos" (claim aprovado) e "80 nodes grátis"
   (verificado). Sem oferta de 50% (encerrou em 31/08), sem "Lumens", sem plano Office, sem menção
   ao plugin de SketchUp (que ainda depende de assinatura na Trimble e do smoke pago do dono).
4. **O par é de 2026-04-28, engine vega/2k** — não é o lote mais recente (set/2026), mas vega/2k é
   engine corrente e o assunto da peça é fidelidade, então a data não enfraquece nada. Não usar o
   par vizinho #475 (vapor/vidro molhado): lá o nicho vira barra de ducha, o piso vira madeira e a
   parede direita ganha revestimento — o "nada." não sobreviveria.
5. **Artefato menor conhecido:** triângulo claro no topo da folha direita do vidro no #473 (~25×30
   px na resolução original). Invisível no feed; não justifica re-render.
6. **Nada foi editado fora desta pasta.** Nenhum arquivo compartilhado do repositório
   (`lib/reel-kit.mjs`, `BRIEF.md`, `roteiros.mjs`, docs) foi tocado. Os recortes de QA criados
   nesta rodada vivem em `qa-zoom/` (`_z_jamb_t3.png`, `_z_mullion_t3.png`, `_z_ceiling_before.png`,
   `_z_ceiling_after.png`), ao lado dos que a sessão anterior deixou.
