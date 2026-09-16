# Cinematografia SpaceNode

Para vocabulário geral de shot language, luz, lente e color grade, invoque a skill
`cinematography`. Este arquivo é o **recorte SpaceNode**: o que funciona em
arquitetura, o que quebra, e como escrever isso em prompt.

---

## 1. A linguagem base: fotografia arquitetônica

Não é filme de ação nem vlog. É fotografia de arquitetura que ganhou movimento.
Isso implica:

- **Verticais verticais.** Linha de parede e montante de esquadria em pé, sem
  convergência de keystone. É a marca de foto de arquitetura profissional.
- **Altura de câmera na altura do olho** (1,50–1,65 m) para interior; mais baixa
  (1,20 m) só quando o pé-direito é o assunto.
- **Grande angular controlada**: 16–24 mm equivalente em interior, 35–50 mm para
  detalhe. Nunca fisheye, nunca distorção de borda visível.
- **Profundidade de campo grande.** Arquitetura quer tudo nítido. Bokeh só em
  shot de detalhe (textura, junta, puxador).
- **Exposição estável.** Nada de auto-exposição pulsando ao longo do take.

## 2. Movimentos permitidos

Ordenados por segurança (mais seguro primeiro):

| Movimento | Uso típico | Risco de hallucination |
|---|---|---|
| Static cinematic shot | fecho, detalhe, "respire" | nenhum |
| Slow push-in (dolly in) | revelar ambiente, hero shot | baixo |
| Slow pedestal (sobe/desce) | mostrar pé-direito, mesa | baixo |
| Lateral tracking | passar por uma fachada, bancada | baixo–médio |
| Controlled parallax | dar volume a uma cena | médio |
| Subtle orbit (≤ 15°) | contornar um móvel, um pilar | médio |
| Crane suave | transição interior→exterior | médio–alto |
| Slow pull-back (dolly out) | fecho de conjunto | **alto** |
| Architectural walkthrough | tour, só com material real | alto |

O pull-back e o walkthrough revelam área que o modelo **não viu** na imagem de
origem — é exatamente onde ele inventa. Use apenas com `end_image_url` ancorando
o destino, ou faça com Ken Burns invertido sobre um render mais aberto.

## 3. Movimentos proibidos

Rápido demais · órbita 360° artificial · drone em interior · warping · mudança
brusca de perspectiva · handheld tremido · whip pan · zoom estilo "câmera de
celular" · qualquer coisa que o BRIEF chama de transição genérica de TikTok.

## 4. Como o reel-kit faz câmera sem IA

O movimento mais usado da SpaceNode é feito em ffmpeg, de graça e com fidelidade
perfeita. Parâmetros do spec (ver `marketing/scripts/REEL-KIT.md`):

- `kenburns: [de, até]` — zoom linear, **máximo 1.08**. `[1, 1]` = parado.
- `pan: [x0, x1]` / `panY: [y0, y1]` — centro do zoom em fração da folga
  (0 = esquerda/topo, 0.5 = centro, 1 = direita/base).
- Combinação de revelação: `kenburns: [6, 1]` + `pan: [0.74, 0.5]` +
  `panY: [0.88, 0.5]` abre num detalhe de textura e afasta até a imagem inteira.
  É o "mistério" — push-out sem risco nenhum de geometria inventada.

Regra prática: **se o movimento pretendido cabe em zoom + pan sobre um still,
ele não deveria custar dinheiro.**

## 5. Ficha técnica por shot

Todo shot da shot list carrega, quando relevante:

```
lens          16mm / 24mm / 35mm / 50mm equivalente
height        altura da câmera em metros
framing       wide / medium / detail; o que está no terço central
trajectory    push-in 0.6m ao longo de 5s (ou: parado)
speed         lenta, constante, sem aceleração
dof           profunda (f/8 equivalente) | rasa só em detalhe
lighting      hora do dia, direção da luz principal, temperatura
exposure      estável; sem mudança dentro do take
motion        mínimo viável; só a câmera se move
```

## 6. Escrevendo o prompt de câmera

Para nuances por família de modelo (Kling, Seedance, GPT Image), invoque
`fal-prompting`. A estrutura que funciona aqui:

```
[o que é a cena, em 6-10 palavras, descrevendo o que JÁ está na imagem]
[movimento de câmera, um só, com velocidade]
[luz e atmosfera, se mudam — se não mudam, diga que não mudam]
[trava de fidelidade]
```

Exemplo de forma (adapte ao projeto real, não cole):

```
Contemporary living room, floor-to-ceiling window, late afternoon light.
Camera pushes in slowly and steadily, about half a meter over five seconds.
Lighting stays exactly the same throughout.
Static architecture: geometry, walls, window frames, furniture and materials
do not change. Only the camera moves. No morphing, no new objects.
```

Dois erros recorrentes:
- descrever o que você **quer que apareça** (o modelo cria) em vez do que **já
  está lá** (o modelo preserva);
- pedir dois movimentos no mesmo take. Um take, um movimento.

## 7. Grade

Discreto. A SpaceNode não tem look de filme — tem look de fotografia de
arquitetura bem exposta. Contraste suave, pretos não esmagados, sem teal&orange,
sem vinheta pesada. Grão só se for muito leve e a peça inteira tiver (nunca em um
shot só, fica remendo).
