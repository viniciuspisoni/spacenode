# QA — R3 · pisca. a casa não se mexe.

- **Slug:** `2026-09-04-reel-pisca-fachada-geminada`
- **Peça orgânica:** `2026-09-04-reel-pisca-fachada-geminada.mp4` — 1080×1920, 30fps, H.264, yuv420p, sem áudio, 9,00s, 2,95 MB
- **Peça paga:** `../2026-09-04-reel-pisca-fachada-geminada-ad/2026-09-04-reel-pisca-fachada-geminada-ad.mp4` — mesmo formato, 6,00s, 1,78 MB (re-renderizada nesta sessão, ver abaixo)
- **Spec:** `spec-src.json` (cópia canônica em `spec.json`) · render por `node marketing/scripts/reel-spec.mjs <spec>`
- **Assets (acervo real, sem geração nova):** print `assets/0382-render-before.jpg` (1567×857) e render `assets/0381-render-after.jpg` (2784×1536), job b282d9b5, 2026-04-30, vega/2k, folha `render-ext-10`. Nenhum pré-processamento em `src/` foi necessário.

## Timeline (orgânica, 9,00s)

| t | conteúdo | texto em tela |
|---|---|---|
| 0,00–1,00 | print #382, banda 4:3 1080×810 em y=556, moldura #1a1a1a fixa, 4 marcas de registro #30d158 | hook entra em 0,15s |
| 1,00–1,80 | corte seco → render #381 (0,8s) | hook |
| 1,80–2,40 | corte seco → print (0,6s) | hook |
| 2,40–2,90 | corte seco → render (0,5s) | hook |
| 2,90–3,30 | corte seco → print (0,4s) | hook |
| 3,30–3,60 | corte seco → render (0,3s) | hook |
| 3,60–3,90 | corte seco → print (0,3s) — último pisca | hook |
| 3,90–4,40 | render preso, marcas ainda visíveis | hook até 4,00; payoff a partir de 4,00 |
| 4,40–7,20 | render, Ken Burns 1,00→1,05, marcas somem em 4,40 | payoff (hook + eyebrow "fidelidade geométrica" + "mesma câmera, mesmos vãos, mesma escada.") |
| 7,20–9,00 | scrim 80% sobre o render + logo monocromático + pílula CTA + microcopy | "Teste com um projeto real →" · "80 nodes grátis · sem cartão · em português" |

Cadência do pisca: 7 cortes, o mais rápido em 0,3s → 1,67 flashes/s, abaixo do limiar de 3 Hz (fotossensibilidade). Todas as transições são `cut` — nenhum xfade, nenhum fade. O device É a ausência de transição.

## O que foi conferido, frame a frame

Folha: `qa-sheet.jpg`. Frames em `qa-frames/`. Frames extras (blends 50/50 e tempos fora da grade) foram extraídos do mp4 durante o QA para uma pasta de rascunho, fora da pasta da peça.

- **t=0,50s (print, hook):** hook "pisca. / a casa não se mexe." em duas linhas, Geist 500, legível e inteiro, entre y≈340 e y≈470 — dentro de 220–1600. As 4 cruzes verdes caem exatamente nos cantos externos dos dois cubos (topo y=797, base da laje y=1037). Fundo #1a1a1a liso acima e abaixo da banda: a área que pisca é só a banda, não a tela.
- **t=1,40s / 2,10s / 3,45s / 3,75s (pisca):** a alternância confere com a timeline (3,45 = render, 3,75 = print). Na miniatura da folha as colunas 4 e 5 parecem iguais; nos PNGs em resolução plena são claramente render e print. **Não é defeito da peça, é a folha em 1/6 de escala.**
- **Alinhamento (o teste que importa nesta peça):** blend 50/50 das duas bandas (print t=3,75 × render t=3,45), banda inteira e zoom 2× nos quatro cantos marcados. **Aresta única, sem fantasma**, em: coroamento e ombreira dos dois cubos, montantes das esquadrias, laje intermediária, muro de concreto, torre da escada e laje do abrigo do carro. A deriva de ~1% que o parecer previa não aparece no recorte 4:3 usado — **nenhuma correção de escala foi necessária**, o spec usa os originais sem `scale`. Fantasma só onde é honesto e esperado: vegetação, piso, encosta e carro (entorno).
- **t=3,96s → 4,03s (troca de texto):** o hook sai e o payoff entra em corte seco, sem sobreposição de camadas e sem os dois textos na mesma altura. Wipe nenhum: o texto nunca é atravessado.
- **t=4,20s (payoff):** eyebrow "FIDELIDADE GEOMÉTRICA" com os dois fios de 0,5px; apoio "mesma câmera, mesmos vãos, mesma escada." inteiro em uma linha, baseline ≈1510 — dentro da zona segura (limite 1600). Sem viúva, sem corte de palavra.
- **t=7,17s → 7,24s (entrada do CTA):** corte limpo, o payoff sai por inteiro antes do card entrar. Sem flash claro em nenhum dos oito cortes — o fundo é chapado e a banda nunca muda de geometria; a variação de luminância é a do céu do próprio par, que é o assunto.
- **t=8,10s / 8,90s (card final):** logo monocromático, pílula branca "Teste com um projeto real →" e microcopy "80 nodes grátis · sem cartão · em português" legíveis sobre o render escurecido a 80%. Bloco inteiro entre y≈820 e y≈1130. Sem URL na arte. Sem card preto no fim — o render continua atrás do scrim, o que preserva o loop.
- **Verde:** nenhuma palavra verde em nenhum card. O #30d158 aparece só nas 4 marcas de registro (44px, 0,85 de opacidade, ~0,2% da tela) e some em 4,40s — uso funcional, dentro do teto de 5%.
- **Banda:** 1080×810 a partir de recortes 1143×857 (print) e 2048×1536 (render), ambos 1,333 — nenhum esticamento, aspecto idêntico nos dois lados do pisca.
- **Linguagem:** hook em minúsculas com ponto final, 6 palavras ("pisca. a casa não se mexe."), duas frases curtas, sem exclamação, sem hype, "IA" não é o assunto. Eyebrow e apoio no mesmo padrão da landing. CTA da lista aprovada.

**Nenhum defeito real encontrado na peça orgânica — não foi re-renderizada.**

## Decisão sobre a versão paga

A versão de 6s **foi re-renderizada uma vez** (uma rodada). Defeito real na versão anterior: o CTA entrava em 3,90s, no mesmo frame em que o render assumia, já com scrim de 80% — o anúncio terminava sem nunca mostrar o render limpo, ou seja, 2,1s (35% da peça) de imagem abafada logo depois da prova.

Correções aplicadas no `spec-src.json` da peça paga:
- marcas de registro estendidas de 3,90 para **4,40s** (acompanham o batimento de render limpo);
- CTA adiado de 3,90 para **4,40s** — sobra 0,5s de render limpo com o apoio já na tela;
- scrim do card final de **0,80 → 0,72** (a microcopy cinza continua legível).

Conferido depois do re-render: **t=4,10s** render limpo com payoff e marcas, tudo dentro da zona segura; **t=4,60s** CTA completo e legível sobre o render; **t=5,80s** idem no fim. Timeline final: pisca 0–3,90 · render limpo 3,90–4,40 · CTA 4,40–6,00. O pisca (0–3,90s) é o mesmo da orgânica — o alinhamento já validado vale para as duas.

Os três ângulos de anúncio (fidelidade / prazo / apresentação, em `caption.txt`) rodam sobre **o mesmo mp4 de 6s**; a diferença é só a copy.

## Ressalvas e gating

- **Nada de entorno preservado.** Entre print e render mudaram céu, pinheiros, piso (asfalto → intertravado), rochas da encosta, paisagismo e a cor do carro. A copy nomeia isso ("o entorno muda — céu, pinheiros, piso — porque entorno é cena") e a legenda fecha com o limite honesto ("material e vegetação são lidos, não copiados"). **Não editar a legenda para sugerir fidelidade de entorno.**
- **Material ≠ geometria.** A torre da escada muda de ripado escuro para madeira. A peça só afirma câmera, vãos e escada — posição, não acabamento.
- **Nenhum número novo.** Sem percentuais, sem horários, sem contagem de montantes. "em minutos" (variante paga B) é o único claim de tempo e é o aprovado pelo dono. "80 nodes grátis, sem cartão" vem de `lib/plans.ts`. Nada de oferta de 50% (encerrada em 31/08), nada de "Lumens", nada de plano Office.
- **Marca de terceiro.** Os dois assets trazem a estrela da Mercedes na grade do carro (~17px na banda). Ken Burns limitado a 1,05 e centrado entre os cubos — sem zoom no carro, sem menção na copy. **Se o dono quiser risco zero em mídia paga**, o par precisa ser trocado por um dos candidatos em retrato (#459←#460, #457←#458, #455←#456, #397←#398), todos sujeitos ao mesmo QA de blend.
- **Origem do print.** O "antes" é um print do modelo enviado pelo próprio dono para a plataforma (job b282d9b5, 2026-04-30) — a peça não afirma nem sugere importação direta. **O plugin de SketchUp não aparece e não é citado**: ele existe e está no ar, mas o .rbz ainda não foi assinado na Trimble e o smoke pago da 0.7 não foi feito, então segue fora de qualquer peça publicável.
- **Fotossensibilidade.** Não acelerar o pisca abaixo de 0,3s por corte em nenhuma variação futura.
- **Autoria.** Não apresentar como "projeto de cliente" com nome, endereço ou crédito de terceiro — o acervo não traz autorização. A peça se apresenta como geração da própria plataforma.
- Nenhum arquivo compartilhado do repo (kit, BRIEF, roteiros, docs) foi alterado. A única edição de spec ficou no `spec-src.json` da peça paga.
