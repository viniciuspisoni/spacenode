# QA — R5 · trocou o piso. não o render. (2026-09-04)

## Arquivos
- Orgânico (10,2 s): `marketing/output/2026-09-04-reel-editar-so-o-piso/2026-09-04-reel-editar-so-o-piso.mp4` (1080×1920, 30 fps, H.264, yuv420p, sem áudio, 3,4 MB)
- Pago (7,2 s): `marketing/output/2026-09-04-reel-editar-so-o-piso-ad/2026-09-04-reel-editar-so-o-piso-ad.mp4`
- Specs: `spec-src.json` em cada pasta (o kit copia para `spec.json`); `probe.json`, `qa-frames/`, `qa-sheet.jpg`
- Still derivado: `src/stacked-piso.png` (1270×952) — recorte `crop=1270:474:2050:798` aplicado nos DOIS originais (#75 e #760, coordenadas idênticas), empilhado com `vstack` e fio branco de 4 px. Não é imagem nova: é corte do acervo. (Ajuste em relação ao slate: 474 px de altura em vez de 470 para o empilhado fechar em 4:3 exato, 1270/952 = 1,334, e casar com a banda da peça sem recorte.)

## Assets (originais em scratchpad/assets/)
- #75 `0075-render-after.jpg` 3328×1280 — render da suíte (2026-06-04, vega/2k), piso de concreto
- #760 `0760-edit-after.png` 3328×1280 — edição real "trocar piso por piso de madeira conforme textura de referência" (2026-06-10), mesma câmera
- Banda fixada em 4:3 (`band.aspect = 1.3333`): o kit recorta o centro → `crop=1707:1280:811:0` (o mesmo recorte do slate), escalado para 1080×810 em y=555. Persiana fica no quadro (~21 % da largura).

## Timeline (--plan confere com o slate)
| t | segmento | texto (overlay global) |
|---|---|---|
| 0,00–2,00 | still #75, Ken Burns parado, backdrop −0,18 | 0,0–1,5: eyebrow "EDITAR · TROCAR MATERIAL" + hook "cliente pediu o piso em madeira." (card `html`, eyebrow acima do hook como na landing) |
| 1,50–2,00 | xfade wipeleft 0,5 s com régua branca | — (texto some no corte, régua atravessa só a imagem) |
| 1,50–6,00 | still #760, Ken Burns 1,00→1,04 | 2,0–5,6: hook "só o piso mudou." / sub "sem regenerar o {ambiente}." |
| 5,60–6,00 | fade 0,4 s | — |
| 5,60–9,00 | still empilhado (concreto em cima, madeira embaixo), Ken Burns 1,00→1,03 | 6,0–8,8: hook "mesma sombra, mesmo tapete, mesma {câmera}." |
| 9,00 | corte seco | — |
| 9,00–10,20 | card final #1a1a1a: logo mono + "Veja no seu próprio projeto →" + "80 nodes grátis · sem cartão · em português" | sem URL na arte (kit já omite quando `url` não é passado; o patch citado no slate não foi necessário) |
Scrim (camada própria) 0–9,0 s.

## Conferido frame a frame (rodada 1 aprovada; 1 renderização por peça)
- t=0,70: eyebrow com fios em y≈270 (> 220), hook em 2 linhas centrado acima da banda, texto inteiro e legível; imagem parada.
- t=1,75 (meio do wipe): antes/depois pixel-alinhados — cama, abajur, persiana e tapete contínuos dos dois lados da régua; só o piso muda de concreto para madeira; sem flash claro.
- t=2,30 e t=4,00: "só o piso mudou." acima da banda, "sem regenerar o ambiente." abaixo (y≈1460 < 1600); verde só em "ambiente"; Ken Burns visível entre os dois frames (enquadramento fecha levemente).
- t=5,80 (meio do fade): sem texto, transição limpa.
- t=7,00: still empilhado com fio branco; listras da persiana caem no mesmo lugar nas duas faixas, tapete idêntico; hook "mesma sombra, mesmo tapete, mesma câmera." em 2 linhas, verde só em "câmera"; nada abaixo da banda.
- t=8,90: sem texto antes do corte; t=9,60: card final, CTA da lista aprovada, microcopy, sem URL, logo monocromático.
- Linguagem: minúsculas com ponto, duas frases curtas, sem exclamação, eyebrow uppercase com fios, hook peso 500, cards #1a1a1a — igual à landing.
- Zona segura: nenhum texto acima de y=220 nem abaixo de y=1600 (o kit validou `bandGeometry`; conferido visualmente).
- Não há vídeo do Animar nesta peça (só stills com Ken Burns).

## Versão paga (7,2 s)
Cenas 4–5 (empilhado) cortadas: #75 (0–2,0) → wipe → #760 (1,5–6,0) → corte → card final "Comece grátis →" (6,0–7,2). Legenda embutida = hook + "só o piso mudou. / sem regenerar o ambiente." Conferido em `…-ad/qa-sheet.jpg` (6 frames): mesmos resultados do orgânico; texto off em 5,8 antes do card. Título "Só o piso mudou." / descrição "Cadastro grátis, sem cartão" / botão SIGN_UP; 3 textos primários (A/B/C) em `caption.txt`.

## Ressalvas
- Estética menor: no still empilhado o fundo desfocado (a própria imagem, regra do kit) mostra uma faixa diagonal escura atrás do hook — vem do blur da persiana. O scrim garante o contraste; texto legível. Se incomodar, a alternativa é o kit aceitar um backdrop diferente do src (não mexi na lib).
- Direção do wipe: `wipeleft` do ffmpeg revela o "depois" da direita para a esquerda (o slate nomeia `wipeleft`; o conceito descrevia "da esquerda para a direita"). Segui o slate.
- Card do gancho é `layout: "html"` (kit não tem eyebrow acima do hook); usa as classes `.hook`/`.eyebrow` do próprio kit, então o estilo é o mesmo.
- Não cita motor/provider, custo em nodes, "em segundos" nem "100 %"; texto diz só o que se vê (sombra, tapete, câmera).

## Gating
- Confirmar que a suíte (input #76, hidden-line na conta do dono) não é projeto de cliente sem `permission_status = granted` antes de publicar.
