# Campanha 2026-09-11 — "Seu projeto, em cena."

Três filmes verticais (1080×1920, 30 fps, H.264 yuv420p bt709), montados no Remotion
(`marketing/remotion/`) a partir de material 100% real: par de projeto de cliente que a
landing serve, capturas do site publicado em Glass Mode, capturas do app logado (dados
privados mascarados) e a gravação real do plugin no SketchUp de 07/09.

**Custo de geração: US$ 0,00.** Nenhuma imagem foi gerada por IA externa (LEI 3).

| arquivo | duração | o que é |
|---|---|---|
| `v1-seu-projeto-em-cena.mp4` | 35 s | filme principal, abertura principal |
| `v1-seu-projeto-em-cena-abertura-A.mp4` | 35 s | abertura A: resultado pronto → corte para o modelo |
| `v1-seu-projeto-em-cena-abertura-B.mp4` | 35 s | abertura B: modelo → render revelado pela régua |
| `v2-a-vista-que-voce-escolheu.mp4` | 20 s | plugin para SketchUp |
| `v3-olhe-para-as-linhas.mp4` | 15 s | prova visual antes/depois |
| `*-mudo.mp4` | idem | mesmas peças sem áudio (orgânico entra mudo no Instagram) |

Saída em `marketing/output/2026-09-11-campanha/`. Regenerar: `node marketing/remotion/render.mjs`.

---

## Projeto principal

**Cozinha · muda arquitetura** — `public/proj-cozinha-ceramica-{base,render}.jpg`, o mesmo par
que a seção Projetos da landing serve, conferido em cheio (mesma câmera: 1,896 : 1 vs 1,893 : 1).

Por que ela e não outra: (1) fidelidade verificável a olho — porta de correr com batente,
lava-louças + geladeira + estante alinhados, sete portas de vidro nos armários altos, ladrilho
hidráulico atravessando o render sem mudar um desenho; (2) materialidade forte para o detalhe
(ladrilho + bancada de madeira + luz da janela); (3) é o par que abre a seção Projetos, então o
"encaixe" do render no site é literal.

O par foi pré-ampliado 2× com Lanczos (`cozinha-*-2x.jpg`) só para o recorte 9:16 em tela
cheia não sair mole — nenhum pixel de conteúdo mudou.

**Crédito na peça:** `projeto · muda arquitetura` (minúsculo — é a marca), presente sempre que
o projeto está em cena, além da legenda.

## Material usado

| take | fonte | como foi obtido |
|---|---|---|
| modelo / render da cozinha | `public/proj-cozinha-ceramica-*.jpg` | acervo autorizado (landing) |
| site em Glass Mode (mobile) | `marketing/output/2026-09-11-campanha/src/site/mobile-landing-full.png` | `node marketing/scripts/produto/capturar-glass.mjs` contra https://spacenode.app (430×932 @3×, página inteira) |
| app Renderizar / Meus Spaces | `marketing/output/2026-09-11-campanha-app-vert-tutoriais/src/*/masked/*.png` | `capturar.mjs --app` a 900×1400 @2× com o perfil salvo do dono; saldo, "saldo para ~N renders" e avatar mascarados por `mascarar.mjs` (`mascaras-app-vert.json`) |
| viewport do SketchUp | `…/2026-09-07-reel-plugin-no-sketchup/src/su-43-center.png` | grab real do SketchUp Pro 2022 do dono (07/09) |
| painel do plugin (estados) | `…/src/masked/panel-{00,01,11,12,13,14}.png` | idem, e-mail e saldo já mascarados |
| time-lapse da geração | `…/src/gerando-timelapse-sem-saldo.mp4` | 53 quadros de uma geração real (Quasar 2K, 2 min 27 s) |
| par da sala (V2, abertura) | `renders.input_url` / `output_url` da geração de716672 | mesma câmera garantida pelo banco |
| trilha e efeitos | `marketing/remotion/public/audio/*.wav` | sintetizados por `marketing/remotion/tools/synth-audio.mjs` |

## Textos na tela

V1 · começou com este modelo. → conheça a SpaceNode. → renderize de dentro do SketchUp. →
do modelo à apresentação. → veja no seu próprio projeto. · spacenode.app
(+ chip "espera comprimida · o render leva minutos" durante o time-lapse)

V2 · o enquadramento começa aqui. → a vista que você escolheu. → o render volta ao painel. →
compare com o seu modelo. → renderize seu projeto. · spacenode.app/sketchup

V3 · o modelo. → o resultado. → compare os detalhes. (esquadria · mobiliário · alinhamento) →
teste com um projeto real. · spacenode.app

---

## VÍDEO 1 — "Seu projeto, em cena." (35 s)

| tempo | take | câmera | texto |
|---|---|---|---|
| 0–1,6 | render, recorte 9:16 no canto da pia | push-in 1,00→1,06 | — |
| 1,6–3,0 | **corte seco** para o modelo, mesmo recorte, mesmo ponto do zoom | continua o push-in | começou com este modelo. |
| 3,0–3,5 | régua branca revela o render sobre o modelo | — | (texto some em corte) |
| 3,5–5,6 | render, hero | deriva mínima | crédito |
| 5,6–8,0 | detalhe: ladrilho + bancada + luz da janela | recorte 1,75→1,86, deslocamento lateral | crédito |
| 8,0–10 | o render encolhe até a célula da seção Projetos; o site aparece em cartão de vidro | spring, sem bounce | — |
| 10–13,3 | a página sobe até o hero em Glass Mode | movimento contínuo, ease in-out | conheça a SpaceNode. (11,9→14) |
| 14–15,6 | viewport real do SketchUp | push-in 1,04 | renderize de dentro do SketchUp. |
| 15,6–17 | painel do plugin, clique em **Capturar vista** | tela estável | idem |
| 17–18 | vista capturada, guias de terços | estável | idem |
| 18–21 | time-lapse da geração (4,4 s gravados → 3 s) | estável | chip "espera comprimida…" |
| 21–22 | resultado no painel | estável | — |
| 22–26 | app Renderizar com a base carregada → aproximação até a referência → render entra pela régua | push 0,60→1,08 | do modelo à apresentação. |
| 26–29 | Meus Spaces (organização do projeto) | push leve | idem |
| 29–31 | render em tela cheia | push-in 1,05 | crédito |
| 31–35 | escurece → logo + chamada + URL | — | veja no seu próprio projeto. · spacenode.app |

**Aberturas alternativas** (`opening` da composição; o resto é idêntico):
- **A** — render parado como fotografia (0–1,7 s) → corte para o modelo (1,7–3,0) → régua.
- **B** — modelo (0–1,3 s, texto entra aos 0,2 s) → render revelado pela régua (1,3–2,7) → segue sem
  segunda régua.

## VÍDEO 2 — "A vista que você escolheu." (20 s)

| tempo | take | texto |
|---|---|---|
| 0–1,2 | modelo da sala (captura do plugin), banda inteira | o enquadramento começa aqui. |
| 1,2–2,1 | régua → render da mesma câmera | idem |
| 2,1–3,5 | render segura | idem |
| 3,5–5 | viewport real do SketchUp | a vista que você escolheu. |
| 5–6,7 | painel entra pela direita; clique em Capturar vista | idem |
| 6,7–8 | vista capturada, guias | — |
| 8–12,4 | time-lapse da geração em tempo real do registro (4,4 s) | chip "espera comprimida…" |
| 12,4–14 | resultado no painel | o render volta ao painel. |
| 14–17,5 | comparador do painel: régua de captura → render, dentro do preview | compare com o seu modelo. |
| 17,5–20 | render escurece → logo + chamada | renderize seu projeto. · spacenode.app/sketchup |

## VÍDEO 3 — "Olhe para as linhas." (15 s)

| tempo | take | texto |
|---|---|---|
| 0–1,5 | modelo, imagem inteira em banda | o modelo. |
| 1,5–2,4 | régua → render, mesma câmera (linha só na altura da banda) | o resultado. |
| 2,4–4,5 | render segura | o resultado. + crédito |
| 4,5–8 | split empilhado (modelo / resultado), mesmo recorte: porta de correr e batente, marcação fina "esquadria" | compare os detalhes. |
| 8–11 | split: lava-louças, geladeira e estante, marcação "mobiliário" + linha tracejada "alinhamento" no tampo | idem |
| 11–12,5 | render limpo, sem marcações | crédito |
| 12,5–15 | render em tela cheia → logo + chamada | teste com um projeto real. · spacenode.app |

---

## Som

Trilha instrumental sintetizada no repositório (pad em Ré menor, pulso a 84 BPM que cresce,
brilho discreto no último terço) — sem melodia cantada, sem licença de terceiros porque não
há terceiros. Efeitos: whoosh nas réguas, click nos botões, tick nas trocas de tela, um único
impacto por peça na revelação do render. Normalizado a ≈ −18 LUFS / −1,3 dBTP com `loudnorm`
sobre o áudio (vídeo copiado bit a bit). Cada peça também sai muda — o Reel orgânico entra
mudo no Instagram (BRIEF.md); a versão com áudio é para anúncio, site e envio direto.

## Material ausente e ressalvas (declarado, não escondido)

1. **Plugin com o projeto principal.** Não existe gravação do plugin com o modelo da cozinha —
   o `.skp` é da muda arquitetura e não está no repo. O trecho do plugin (V1 14–22 s e V2 inteiro)
   usa a gravação real com a sala do dono. O texto não afirma que é o mesmo projeto. Para fechar
   a continuidade, faltaria o dono abrir um modelo autorizado no SketchUp e regravar
   (receita na memória "Reel do plugin com capturas reais").
2. **Sala do dono como prova de detalhe: rejeitada.** Os pendentes de gaiola viraram globos
   lisos e as ripas do forro mudam de contagem no render (09/09). Serve para o fluxo do plugin
   (imagem pequena no painel), não para "olhe para as linhas".
3. **Painel do plugin a 440×780.** Único material do painel; ampliado 1,5× na montagem
   (mesma geometria dos Reels de 07/09). Legível, mas não nítido em 4K.
4. **Autorização de canal.** `marketing/AUTORIZACOES.md`: muda arquitetura tem landing ✅,
   orgânico ❓, mídia paga ❓. As peças estão prontas; **a publicação depende do aceite do canal**.
5. **Resultado "na plataforma".** O app não tinha o render da cozinha na conta do dono; a
   régua dentro da referência do Renderizar é montagem sobre a UI real com o render real
   (saída da própria plataforma), apresentada como demonstração, não como gravação de tela.
6. **Vídeo arquitetônico.** Não há vídeo do Animar para a cozinha; os movimentos são Ken Burns
   sobre o render (fidelidade perfeita por construção). Os únicos vídeos reais são o time-lapse
   do plugin e as réguas.
