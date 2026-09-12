# Sound design

## 1. A decisão que vem primeiro: a peça tem áudio?

| Destino | Áudio | Por quê |
|---|---|---|
| **Reel orgânico** | **não** — entrega mudo | a música entra no app do Instagram, que dá alcance para áudio em alta. Spec do BRIEF: Reel sai sem áudio. |
| **Anúncio (Meta Ads)** | sim, se ajudar | não passa pelo app; mas **tem que funcionar mudo** — o áudio é bônus, nunca a narração |
| **Filme de marca / site / YouTube** | sim | é onde o som constrói o valor percebido |
| **Demo de produto** | opcional | UI sounds discretos ajudam a ler a interação |

O padrão da casa hoje é **entregar mudo em orgânico**. Não invente trilha porque
"ficaria melhor com música" — quebra a estratégia de alcance.

## 2. Quando tem áudio: as camadas

```
1. MÚSICA       bed contínuo, baixo, sem melodia cantada
2. AMBIÊNCIA    sala, rua, pássaros distantes — dá corpo ao espaço
3. MOVIMENTO    whoosh curto no wipe, discreto
4. IMPACTO      um hit no corte da virada — no máximo um por peça
5. UI           click/tick fino quando a interface responde
```

## 3. Regras

- **O som acompanha o motion.** Um whoosh sem transição visual é ruído; uma
  transição visual forte sem som soa vazia em peça com áudio. Marque os tempos na
  timeline (`--plan` do reel-kit dá os tempos exatos) antes de escolher os SFX.
- **Um impacto por peça.** Na virada. Trailer boom a cada 2 segundos é o som
  equivalente ao glitch neon que o `brand.md` proíbe.
- Música: instrumental, minimal, tempo baixo, sem drop. Referência de nível:
  filme de produto premium, não montagem de academia.
- Nada de áudio genérico de TikTok, nada de voz sintética narrando benefício.
- Fade in 0,3s no começo e fade out 0,5s no fim — corte seco de áudio soa amador.
- Loudness: mixe para caber embaixo da fala do espectador, não para competir.
  Alvo prático ≈ -16 LUFS em peça com música, com pico ≤ -1 dBTP.

## 4. Se for gerar áudio

Geração de áudio é **paga** e passa pelo mesmo portão de custo da LEI 2.
Descubra endpoints em runtime (comandos gratuitos):

```bash
genmedia models "music" --json
genmedia models "sound effects" --json
genmedia schema <endpoint_id> --json
genmedia pricing <endpoint_id> --json
```

Antes de gerar, pergunte: a peça é orgânica? Então provavelmente não precisa de
áudio nenhum e a geração é desperdício.

Alternativa sem custo: alguns modelos de vídeo (Seedance 2.0) geram áudio
sincronizado junto com o vídeo, e a doc da fal diz que **o preço é o mesmo com ou
sem áudio** (`generate_audio` default `true`). Se a peça vai ter som, deixar
ligado é grátis. Se vai sair muda, desligar não economiza — mas evita entregar um
arquivo com áudio indesejado que alguém esquece de remover.

## 5. Mixagem na montagem

O reel-kit renderiza **sem áudio**. Para colar trilha numa peça de anúncio, use
ffmpeg via `marketing/scripts/lib/tools.mjs` como passo final, depois do QA
visual — assim o QA de vídeo não precisa ser refeito:

```bash
ffmpeg -i peca.mp4 -i trilha.m4a -shortest -c:v copy -c:a aac -b:a 192k peca-com-audio.mp4
```

`-c:v copy` preserva o vídeo bit a bit — sem reencode, sem perda, sem risco de
alterar a imagem que já passou no QA.
