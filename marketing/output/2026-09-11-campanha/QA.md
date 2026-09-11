# QA — 2026-09-11-campanha (V1 + aberturas A/B, V2, V3)

Frames inspecionados (Read) em `qa-frames/`: `v1-sheet.png` (14 quadros, 1,0→33 s),
`v1ab-sheet.png` (aberturas A e B, 0,8→3,2 s), `v2-sheet.png` (9 quadros), `v3-sheet.png`
(9 quadros), `v1-app-thumb.png` (trecho do app corrigido + primeiro frame). Antes disso, uma
passagem inteira em meia escala (`marketing/remotion/out/qa/*-half.mp4`, 22 + 16 + 14 + 12
quadros) que derrubou três problemas, corrigidos e re-renderizados:
- trecho do app em 22–26 s abria num vazio bege (referência pequena no canto) → agora abre na
  página inteira e aproxima até a referência; painel lateral com "20 nodes" fica fora do quadro;
- régua do V2/V3 atravessava o quadro inteiro em vez da banda → linha limitada à banda;
- etiqueta das marcações do V3 ("esquadria") saía cortada pela borda da caixa → etiqueta dentro do retângulo.

## ARQUITETURA
- [x] geometria preservada — as únicas imagens de projeto são o par real (mesma câmera) e os
      recortes/zooms são Ken Burns (≤ 1,08 nos hero shots; 1,86 só no detalhe, que é recorte)
- [x] nada nasceu, nada sumiu, materiais iguais — conferido em cheio: porta + batente, lava-louças/
      geladeira/estante, 7 portas de vidro, ladrilho; folhas em `scratchpad/sheets/v3-*.jpg`
- [x] esquadrias e linhas retas íntegras nos dois lados do split (V3)
- [x] sem morphing/texture swim — não há vídeo gerado por IA na peça
- [x] par da sala (V2) usado só em banda inteira e no painel; rejeitado para close (pendentes)

## VÍDEO
- [x] 1080×1920, 30 fps, h264, yuv420p, bt709 (ffprobe nos 10 arquivos)
- [x] durações 35,0 / 20,0 / 15,0 s (mudas) e +0,1 s nas com áudio (priming do AAC)
- [x] movimento suave, um por take; corte render→modelo cai no mesmo enquadramento (V1 1,6 s)
- [x] sem flash claro no corte — o modelo entra a 0,9 de brilho
- [x] still → vídeo → still do painel na geometria exata do time-lapse (664×1180 em 208,370)
- [x] primeiro frame = render da pia com ladrilho e planta (thumbnail forte)

## DESIGN
- [x] Geist variável (peso 500 nos hooks, 400 no resto), minúsculas com ponto final
- [x] uma ideia por tela; texto troca em corte, a régua nunca atravessa texto
- [x] zona segura: hooks entre y=236 e 540, chip a 1556–1600, crédito a 1540/1560, nada acima de 220
- [x] sem verde (landing em vidro usa branco); logo monocromático nas três cartelas finais
- [x] scrim sob texto sobre imagem clara; cartão de vidro sob texto sobre UI clara
- [x] sem emoji

## PERFORMANCE
- [x] hook claro nos 2 s (render → "começou com este modelo.")
- [x] compreensível sem áudio — os textos carregam a narrativa
- [x] CTA claro em cada peça; URL correta (spacenode.app / spacenode.app/sketchup)
- [x] nada parado > 3 s sem mudança (o maior hold é o hero 3,5–5,6 s, com deriva)

## CRÉDITO
- [x] "projeto · muda arquitetura" NA PEÇA (V1 3,3–8 s e 29,5–35 s; V3 2,5–4,5 s e 11–15 s), grafia
      minúscula como a marca
- [ ] `marketing/AUTORIZACOES.md`: orgânico ❓ e mídia paga ❓ — **publicação bloqueada até o aceite do canal**
- [x] par `-base`/`-render` de `public/`, conferido em cheio
- [x] nenhum dado privado: saldo, "saldo para ~N renders" e avatar mascarados no app; painel do
      plugin já vinha com e-mail e saldo cobertos; site é a página pública

## MARCA
- [x] parece SpaceNode: vidro escuro, respiro, tipografia da landing, nada de neon/glitch/partícula
- [x] voz: "nodes" nunca aparece como claim; nenhum preço, plano, métrica ou promessa de tempo
      ("o render leva minutos" é o claim aprovado; o contador real do time-lapse mostra ~2 min)
- [x] "renderize de dentro do SketchUp" descreve o plugin corretamente (captura a vista, o render
      volta ao painel)

## ÁUDIO
- [x] I = −18,1 / −18,0 / −19,1 LUFS, pico −1,3 / −1,4 / −0,8 dBFS (ebur128 após loudnorm)
- [x] fade in 0,3 s / fade out 0,8 s; um impacto por peça; efeitos 2 frames antes do movimento
- [x] versão muda entregue para orgânico

## Pendências de publicação
1. Aceite da muda arquitetura para orgânico e/ou mídia paga (registrar em AUTORIZACOES.md).
2. Se o dono quiser o plugin com o MESMO projeto: regravar no SketchUp com um modelo autorizado.
