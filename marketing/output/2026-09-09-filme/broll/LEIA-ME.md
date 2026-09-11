# B-roll do filme — animação de renders REAIS pelo motor do próprio produto

Os clipes daqui foram gerados com **Veo 3.1 via fal** — exatamente o motor "Cinemático"
do módulo Animar (`lib/video/models.ts:107`), a partir de renders que já são output real
do SPACENODE. Não é imagem inventada por IA externa fingindo ser produto (o que o
`BRIEF.md` §4 proíbe): é o produto usando o produto.

Custo real no livro-caixa `gasto.json`. Teto autorizado pelo dono: US$ 15.

## Achado do QA — a janela de fidelidade

`sala-dolly.mp4` (6 s, a partir de `base/sala-16x9.png`) **só é fiel nos primeiros ~2,5 s**.

| tempo | o que acontece |
|---|---|
| 0,0–2,5 s | fiel. Câmera faz um travelling lateral+frontal, com paralaxe real entre a coluna preta, o forro ripado em leque e a parede de pedra. Nenhuma geometria muda. |
| ~3,0 s | o forro em leque começa a achatar (as ripas viram paralelas). |
| ~5,8 s | **inventa uma segunda coluna**, alarga a sala e rearranja os pendentes. |

Causa provável: o modelo puxou a câmera para TRÁS em vez de para a frente. Um dolly-out
obriga o modelo a inventar o que estava fora do quadro; um push-in só interpola o que já
existe. Se for gerar de novo, peça explicitamente push-in e prefira 4 s a 6 s.

**Consequência para a montagem:** usar apenas `start: 0, dur: 2.4`. Num filme cuja tese é
que a geometria não se mexe, deixar rodar até os 6 s desmentiria a peça no próprio quadro.
