# Model routing + custo (overlay SpaceNode)

A skill `model-routing` (fal-ai) dá os defaults gerais do catálogo. **Este arquivo
manda quando os dois discordarem**, porque os critérios da SpaceNode são outros:
fidelidade arquitetônica acima de tudo, e orçamento de mídia apertado.

Nunca invente endpoint ID. Nunca decore preço: reconfira antes de pedir aprovação.

---

## 1. A decisão que vem antes da escolha do modelo

```
O shot precisa mesmo de um modelo generativo?
├─ é câmera lenta sobre um render parado?        → ffmpeg / reel-kit. Custo 0.
├─ é corte, wipe, mosaico, split, card de texto? → ffmpeg / reel-kit. Custo 0.
├─ é UI do app ou painel do plugin?              → captura real. Custo 0.
└─ precisa de paralaxe real, vento, luz mudando,
   água, presença humana?                        → aí sim, vídeo de IA.
```

A maior economia da SpaceNode não é escolher o modelo barato. É perceber que
**a maioria dos shots não precisa de modelo nenhum.**

## 2. Critérios de decisão, na ordem que vale aqui

1. **Fidelidade arquitetônica** (elimina candidatos)
2. **Qualidade de image-to-video** (o projeto entra como imagem, sempre)
3. **Consistência temporal** dentro do take
4. **Controle de câmera** por prompt
5. **Suporte a start/end frame** (ancorar destino = menos hallucination)
6. Resolução · 7. Duração máxima · 8. Tempo de geração · 9. **Custo** ·
10. Adequação ao shot específico

Modelos diferentes para shots diferentes **é o comportamento esperado**, não uma
exceção. Um hero shot pode ir no caro; um b-roll de 1,5s coberto por texto vai no
barato.

## 3. Tabela de preços medida

Medido em **2026-09-11** com `genmedia pricing <id> --json`. Preço muda:
**reconfira sempre antes de estimar.**

| Endpoint | Preço unitário | Unidade |
|---|---|---|
| `bytedance/seedance-2.0/image-to-video` | 0,014 | 1000 tokens |
| `bytedance/seedance-2.0/text-to-video` | 0,014 | 1000 tokens |
| `bytedance/seedance-2.0/fast/image-to-video` | 0,0112 | 1000 tokens |
| `fal-ai/kling-video/v3/pro/image-to-video` | 0,14 | segundo |
| `fal-ai/kling-video/v3/pro/text-to-video` | 0,14 | segundo |
| `xai/grok-imagine-video/image-to-video` | 0,05 | segundo |
| `fal-ai/nano-banana-pro` | 0,15 | imagem |
| `fal-ai/nano-banana-pro/edit` | 0,15 | imagem |
| `fal-ai/flux-2/klein/9b` | 0,006 | megapixel |
| `openai/gpt-image-2` | 1,00 | "units" (**não informativo**) |

### 3.1 Preço por token — a conta

Endpoints Seedance cobram por token de vídeo:

```
tokens = (altura × largura × fps × duração) / 1024      fps = 24
custo  = (tokens / 1000) × unit_price
```

Conferido contra a doc da fal (720p com áudio ≈ US$ 0,3034/s; a fórmula dá
US$ 0,3024/s).

| Resolução (9:16) | tokens/s | Seedance 2.0 | Seedance 2.0 fast |
|---|---|---|---|
| 480p (480×854) | 9.608 | US$ 0,135/s | US$ 0,108/s |
| 720p (720×1280) | 21.600 | US$ 0,302/s | US$ 0,242/s |
| 1080p (1080×1920) | 48.600 | US$ 0,680/s | US$ 0,544/s |

**Armadilha:** subir de 720p para 1080p mais que dobra o custo. Para Reel que o
Instagram vai recomprimir, 720p gerado e upscale local com ffmpeg costuma ser a
escolha certa. O schema do Seedance 2.0 i2v na doc da fal só lista 480p/720p —
mas o `genmedia schema` já listou 1080p/4k. **Confirme no schema em runtime.**

### 3.2 Custo de um take de 5s, comparado

| Modelo | 5s @ 720p |
|---|---|
| `xai/grok-imagine-video/image-to-video` | US$ 0,25 |
| `fal-ai/kling-video/v3/pro/image-to-video` | US$ 0,70 |
| `bytedance/seedance-2.0/fast/image-to-video` | US$ 1,21 |
| `bytedance/seedance-2.0/image-to-video` | US$ 1,51 |
| reel-kit (Ken Burns) | US$ 0,00 |

Ou seja: Seedance 2.0 custa **6×** o Grok e **2,2×** o Kling v3 Pro. Um Reel de
12s com três takes de IA em Seedance passa de US$ 4,50 — mais que o orçamento
diário de um conjunto de anúncio. Trate Seedance como acabamento, não como padrão.

## 4. Roteamento por papel

### Vídeo — arquitetura (o caso principal)

| Papel | Endpoint | Por quê |
|---|---|---|
| Movimento de câmera sobre render | **reel-kit / ffmpeg** | fidelidade perfeita, custo zero |
| Draft de movimento, teste de conceito | `xai/grok-imagine-video/image-to-video` | US$ 0,05/s, rápido, suficiente para validar direção |
| Shot final com paralaxe/vida | `fal-ai/kling-video/v3/pro/image-to-video` | melhor custo/fidelidade; confira controle de câmera no schema |
| Hero shot, transição ancorada | `bytedance/seedance-2.0/image-to-video` | aceita `end_image_url` (ancora o destino); use 4–6s |
| Sequência multi-shot com continuidade | `bytedance/seedance-2.0/reference-to-video` | até 9 imagens de referência (@Image1…); confira schema |

### Vídeo — placa abstrata de marca (sem arquitetura em cena)

`bytedance/seedance-2.0/text-to-video` ou `xai/grok-imagine-video/text-to-video`.
Só aqui text-to-video é permitido.

### Imagem

| Papel | Endpoint |
|---|---|
| Frame com texto legível dentro da imagem | `openai/gpt-image-2` (`quality=high`) |
| Still premium / keyframe | `openai/gpt-image-2` → `fal-ai/nano-banana-pro` |
| Edição a partir de referência (logo, UI, produto) | `fal-ai/nano-banana-pro/edit` |
| Draft barato de composição | `fal-ai/flux-2/klein/9b` |

**Nunca** para gerar "um ambiente arquitetônico" que será apresentado como output
da SpaceNode (LEI 3).

### Áudio

Descubra em runtime — o catálogo muda rápido:
```bash
genmedia models "music" --json
genmedia models "sound effects" --json
genmedia models "text to speech portuguese" --json
```
Antes de gerar qualquer áudio, leia `sound-design.md`: na maior parte das peças
orgânicas o áudio **não é gerado** (entra no app do Instagram).

## 5. Protocolo obrigatório antes de rodar

```bash
genmedia models --endpoint_id <id> --json     # existe e está ativo?
genmedia schema  <id> --json                  # nomes exatos dos campos
genmedia pricing <id> --json                  # preço vigente
```

Nunca passe flag adivinhada: um 422 é **cobrado**. Erro 5xx não é cobrado.

## 6. Estimador

```bash
node .claude/skills/spacenode-video-director/scripts/estimate-cost.mjs \
  --shot "id=s01_hero,endpoint=bytedance/seedance-2.0/image-to-video,seconds=5,res=720p,aspect=9x16" \
  --shot "id=s02_detalhe,endpoint=fal-ai/kling-video/v3/pro/image-to-video,seconds=4" \
  --shot "id=capa,endpoint=fal-ai/nano-banana-pro/edit,images=1" \
  --takes 2 --brl 5.40
```

Ele consulta `genmedia pricing` ao vivo, aplica a unidade certa (segundo, token,
imagem, megapixel) e devolve o total. Campos do `--shot`: `id`, `endpoint`,
`seconds`, `res`, `aspect`, `fps`, `images`, `count`, `takes`. Flags: `--takes`,
`--brl`, `--json`, `--help`.

`--takes N` multiplica por tentativas esperadas — **sempre estime com pelo menos
2**, porque o primeiro take de arquitetura reprova com frequência.

Quando a unidade não for calculável (ver 7), o script **não chuta**: marca o item
como `???`, devolve TOTAL PARCIAL e lista o aviso. Leve esse aviso para o pedido
de aprovação em vez de esconder.

## 7. Quando a unidade não diz nada

`openai/gpt-image-2` volta `1 USD per units`. Isso não é preço utilizável.
Nesses casos: procure na doc (`genmedia docs "<modelo> pricing"`), ou declare
a estimativa como **não confirmada** no pedido de aprovação e proponha uma
chamada única de calibração antes do lote. Nunca chute para baixo.
