# QA — R12 · video-vertical-fachada (Animar · vídeo nativo vertical)

Data: 2026-09-04 · Pilar: demonstracao-de-ferramentas (Animar) · 2 rodadas de render (a 2ª só trocou o apoio) · revisão de 2026-09-04 (tarde): reclassificação de uso + correções de copy, SEM re-render.

## Arquivos e a que uso cada um serve
| Arquivo | Duração | Card final | Uso |
|---|---|---|---|
| `marketing/output/2026-09-04-reel-video-vertical-fachada-ad/2026-09-04-reel-video-vertical-fachada-ad.mp4` | **6,90 s** | sim — "Comece grátis →" | **Feed (Reel orgânico) E anúncio (Meta).** O mesmo arquivo serve aos dois usos: o card final resolve o CTA em tela nos dois. |
| `marketing/output/2026-09-04-reel-video-vertical-fachada/2026-09-04-reel-video-vertical-fachada.mp4` | **6,00 s** | não | **Stories (1 tela, 6 s).** O CTA entra pelo sticker de link "Comece grátis". **Não publicar como Reel de feed.** |

Ambos: 1080×1920, 30 fps, H.264 yuv420p, sem áudio (9,6 MB e 9,8 MB).
Specs: `spec-src.json` em cada pasta (o kit copia para `spec.json`). Frames: `qa-frames/`, folha: `qa-sheet.jpg`, `probe.json`. Legenda + copies pagas: `caption.txt` (nesta pasta).

**Correção da revisão:** o corte de 6,00 s tinha sido descrito como "loop de alcance" — formato que não é aprovado e que deixaria um Reel de feed sem CTA em tela. Ele foi reclassificado como Stories (1 tela, 6 s) e o Reel de feed passou a usar o corte com card final. **Não** se esticou o take com `tpad`/ping-pong para forçar duração: o take é único e tem 6 s reais.

## Asset
- **#137** `assets/0137-video-video_out.mp4` — Animar, veo3.1 image-to-video, 6 s, 1080×1920 nativo (24 fps → 30 fps no kit), job 972ee1cc, 2026-05-23, fachada corporativa ao entardecer (torre de pele de vidro sobre pódio de concreto, praça). Fonte do vídeo: #138 (render 16:9 do mesmo conjunto).
- `fit: cover` — como o vídeo já é 9:16, não há recorte nem banda: preenche o quadro sem faixa e sem esticar (scale 1080×1920 → crop 1080×1920 = identidade).
- Conferência do clipe antes de montar (frames 0 / 2 / 4 / 5,8 s em `scratchpad/qa-r12/sheet137.jpg` + diff 0↔5,8 s): a câmera **avança devagar** (a torre cresce no quadro, a árvore da direita entra mais, o pódio se aproxima), pessoas atravessam a praça, luzes internas estáveis. Sem morphing na malha da fachada, sem duplicação de pilares, sem flicker nos vidros; as pessoas não projetam sombra nítida (fim de tarde — passa). Sem texto/marca-d'água no clipe.
- Ressalva honesta: o enquadramento do vídeo NÃO é o mesmo do render-fonte #138 (o Veo reenquadrou a cena em retrato, mais fechado na torre). Por isso a copy diz "a partir do render" e nunca "mesma câmera do render" — e por isso a copy paga A foi corrigida de "Fachada, esquadrias e câmera do projeto" para "Fachada, esquadrias e **volumes** do projeto": não se pode afirmar a câmera.
- Alternativa #42 (átrio corporativo, 4 s) conferida e descartada: interior, 4 s é curto demais para o hook aparecer em 0,4 s e ficar legível; fica de reserva.

## Timeline (tempo global)
### Feed + anúncio (6,90 s · pasta `-ad`)
| t | visual | texto |
|---|---|---|
| 0,00–0,40 | #137 cover, sem overlay | — |
| 0,40–5,70 | #137 segue (câmera avança, pessoas andam); overlay `hook-fixed` com scrim topo/base | hook (60 px, peso 500, top 300): **a imagem vira o {take}.** / [o projeto continua.] (cinza terciário) · apoio (38 px, bottom 340): Animar · vídeo a partir do render. |
| 5,70–6,00 | xfade `fade` 0,3 s para o card (o overlay sai em corte em 5,70, antes do fade) | — |
| 6,00–6,90 | card final #1a1a1a: logo monocromático + pílula "Comece grátis →" + microcopy "80 nodes grátis · sem cartão · em português", sem URL | — |

### Stories (6,00 s · esta pasta)
| t | visual | texto |
|---|---|---|
| 0,00–0,40 | #137 cover, sem overlay | — |
| 0,40–6,00 | #137 segue; overlay `hook-fixed` com scrim topo/base | mesmo hook/apoio |
Sem card final de propósito: no story o CTA é o **sticker de link "Comece grátis"**, aplicado por cima na publicação. Uma tela só, 6 s.

## O que foi conferido frame a frame
- `t0.20s` (os dois): vídeo sem texto, cores do clipe intactas, sem banda/faixa, sem esticamento (proporções da malha da fachada iguais ao frame bruto do mp4).
- `t0.50s` / `t3.00s` / `t5.90s` (Stories) e `t5.60s` (feed/anúncio): hook inteiro em 2 linhas, Geist 500, "take" é a única palavra verde (#30d158); 2ª linha em cinza terciário como no hero da landing; topo do texto em y≈300, fim em y≈440 (> 220); apoio em uma linha centrado, base em y≈1580 (< 1600). Contraste: scrim do `hook-fixed` (gradiente 0,92→0 em 760 px no topo e 780 px na base) — o hook cai sobre o céu + quina da torre, o apoio sobre a praça de pedra clara escurecida. Ambos legíveis na miniatura de 324 px da folha de QA.
- Movimento: entre `t0.50s` e `t5.90s` as três pessoas do pódio mudam de posição e a torre sobe ~4 % no quadro → o vídeo do Animar está em movimento, não é still.
- `t5.85s` (feed/anúncio): meio do fade — card escuro (#1a1a1a) surgindo sobre o vídeo, sem flash claro; o hook já saiu (overlay termina em 5,70).
- `t6.50s` (feed/anúncio): card final completo, logo monocromático, pílula branca "Comece grátis →", microcopy, sem URL, verde zero.
- Linguagem: hook em minúsculas com ponto, 8 palavras (no teto), duas frases; apoio com nome do módulo capitalizado ("Animar") como na landing; CTA "Comece grátis" da lista aprovada (caixa intacta na pílula).

## Rodadas
1. Eyebrow "ANIMAR" (fios + uppercase 0,22em) + sub "vídeo a partir do render." — o eyebrow caiu sobre a vitrine iluminada do pódio (y≈1470, onde o scrim de base ainda está em ~0,55) e ficou quase invisível na folha de QA. Descartado.
2. Apoio único "Animar · vídeo a partir do render." em 38 px, bottom 340 → cai mais fundo no scrim e sobre a praça. Aprovado nos dois cortes.
3. Revisão (reprovação): só texto e classificação de uso — `caption.txt` e este QA. Nenhum spec mudou, nenhum re-render foi feito; os mp4 e os `qa-frames/` das duas pastas seguem sendo os de 12:55/12:56.

## Ressalvas / gating
- **Gate do dono (bloqueia o pago):** confirmar autoria/permissão do modelo do centro corporativo (#137/#138) **antes de veicular** a variante paga. Registrado também no cabeçalho da variante paga em `caption.txt`.
- Não afirmar na copy: "mesma câmera do render", "câmera do projeto", "câmera parada", "aproximação" (a câmera avança de leve, mas não é push-in fechado), duração além de 6 s, nome do motor (veo3.1 fica fora da arte e da legenda — o preset atual pode rotear diferente).
- O clipe é de 23/05/2026 (Vega 2K na fonte); é geração real do dono na plataforma.
- O corte de 6,0 s é para Stories, não para feed; quem publicar no feed usa o mp4 da pasta `-ad`.
- Nada fora do kit: cards `hook-fixed` + `final` nativos; nenhum card `html` foi necessário; nenhum arquivo compartilhado do repo foi editado.
