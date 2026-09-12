# Ambientação gerada — regras e achados

Clipes gerados do zero com **Veo 3.1 texto→vídeo** (`fal-ai/veo3.1`, US$ 0,20/s, 1080p, 24 fps,
até 8 s, sem áudio). São **imagem de marca**, não output do produto.

## A regra que não pode ser relaxada

`BRIEF.md` §4 e `prohibited-content.md` §3 proíbem usar IA externa para fingir resultado da
plataforma. Então nenhum clipe daqui pode ser legendado, sugerido ou montado de forma que o
espectador entenda "isto foi feito no SPACENODE". Na prática:

- **Pode**: matéria, luz, textura, sombra, poeira, reflexo — a língua física da arquitetura.
- **Não pode**: "um projeto bonito visto por fora", interior mobiliado, fachada — que é
  exatamente o que o produto entrega e seria lido como prova falsa.
- Todo claim sobre o produto acontece sobre material REAL, e só ali.

## Achado: `negative_prompt` não funciona no texto→vídeo

O primeiro clipe (`concreto-luz`, 4 s) pediu explicitamente no `negative_prompt`
"pessoas, mãos, rostos" — e **uma mão entrou no quadro pela direita mesmo assim**. A página do
modelo na fal também não lista `negative_prompt` entre os parâmetros do endpoint de texto.

**Consequência para os próximos prompts:** escrever a proibição no prompt POSITIVO, descrevendo
a cena como vazia em vez de listar o que não pode aparecer. Em vez de confiar em
"sem pessoas", escrever "a parede está completamente vazia; nada e ninguém entra no quadro
durante todo o plano".

Segundo cuidado, aprendido no b-roll de imagem→vídeo: **pedir movimento de câmera para trás faz
o modelo inventar** o que estava fora do quadro. Peça luz que se move com câmera parada, ou um
push-in curto. Prefira 4 s a 6 s: menos tempo, menos deriva.

## Salvamento do `concreto-luz`

A mão está em quadro dos 0 s aos ~3 s (só o último segundo é limpo), então cortar no tempo não
resolve. **Cortar no espaço resolve:** `crop=1300:731:0:200` tira a faixa direita onde a mão
entra e sobra uma sombra diagonal que lê como abstrata. A imagem sobe de 1300 px para 1920 no
reenquadramento, e aguenta — o conteúdo é orgânico e macio, sem aresta dura para denunciar o
upscale. O clipe está aproveitável; não precisa regerar.

No spec, usar assim:
```json
{ "type": "video", "src": "$REPO/marketing/output/2026-09-09-filme/ambientacao/concreto-luz.mp4",
  "dur": 3.4, "fit": "cover" }
```
com o recorte aplicado antes, ou gerando um `concreto-luz-corte.mp4` com o crop acima.
