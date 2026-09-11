# QA — R17 · Editar: tirou o espelho. não a parede.

Slug: `2026-09-04-reel-editar-tirou-o-espelho`
Pasta: `C:/Users/Pisoni/spacenode/marketing/output/2026-09-04-reel-editar-tirou-o-espelho/`
Pilar: demonstracao-de-ferramentas (Editar → remover)
Data do fechamento: 2026-09-04

## Arquivo entregue

| item | valor |
|---|---|
| mp4 | `2026-09-04-reel-editar-tirou-o-espelho.mp4` |
| formato | 1080×1920, 30 fps, H.264, yuv420p, sem áudio |
| duração | 9,70 s (291 frames) |
| tamanho | 1,73 MB |
| spec | `spec-src.json` (fonte) → `spec.json` (cópia gravada pelo kit) |
| render | `node marketing/scripts/reel-spec.mjs marketing/output/2026-09-04-reel-editar-tirou-o-espelho/spec-src.json` |

## Assets (acervo real do dono — nada gerado para o Reel)

- **#52** `assets/0052-render-after.jpg` — render 3040×1408, Sala de Estar, engine vega 2k, 2026-06-17. É o **antes** da edição.
- **#795** `assets/0795-edit3-after.jpg` — edit_v3 3040×1408, action `remove`, instrução do usuário **"remover espelho"**, 2026-07-03, job `b5fb48f8-2864-418f-a8cf-010d9f0f8e69`. É o **depois**.
- Pré-processamento (feito na sessão anterior, fora do kit) em `scratchpad/derived-espelho/`:
  `52-cover-9x16.png` e `795-cover-9x16.png` (792×1408, recorte 9:16 na mesma janela) para o close;
  `52-band-16x9.png` e `795-band-16x9.png` (2502×1408, recorte 16:9 na mesma janela) para a banda.
  Os dois recortes usam a mesma janela no antes e no depois → mesma câmera por construção.
- O par irmão **#797** (mesmo render #52, mas ação `swap_material` / "trocar parede por cimento queimado") **não** é usado. Ver o teste abaixo.

## Timeline (conferida com `--plan` e com `probe.json`)

| t | segmento | transição | texto na tela |
|---|---|---|---|
| 0,00 → 1,90 | still cover **#52** (antes), kenburns off | — | card `antes`: hook **"o espelho sai."** + eyebrow EDITAR · REMOVER |
| 1,40 → 1,90 | wipeleft 0,5 s com régua branca | wipeleft | card `veil`: só o eyebrow (o wipe atravessa a imagem, nunca o texto) |
| 1,40 → 4,40 | still cover **#795** (depois), kenburns 1→1,05 | — | card `hook`: **"tirou o espelho."** + **"[não a parede.]"** em cinza terciário |
| 4,40 → 5,80 | still band **#52** (antes), brightness −0,16 | corte seco | card `eyebrowBand`: só o eyebrow (respiro antes do plano aberto) |
| 5,20 → 8,40 | still band **#795** (depois), kenburns 1→1,04 | wipeleft 0,6 s com régua | 5,80 → 8,40: card `resto`: hook **"o resto ficou."** + sub **"marcou a {área}, disse o que muda."** |
| 8,40 → 9,70 | card `final` | corte seco | logo monocromático + pílula **"Veja no seu próprio projeto →"** + microcopy "80 nodes grátis · sem cartão · em português" |

Banda: 1080×608 em y=656 (aspect 1,778). Overlay `scrim` cobre 4,40 → 8,40.

## Teste obrigatório: a edição regenerou os quadros?

O briefing exige provar que, **fora do espelho, a imagem não mudou** — o par #797 foi refutado no slate exatamente por isso. Rodei diff por `ffmpeg blend=all_mode=difference` entre o antes e cada candidato. Artefatos em `qa-diff/`:

- `diff-52-795-x8.png` — par usado, diferença amplificada ×8
- `diff-52-795-raw.png` — mesma diferença sem amplificação
- `diff-52-797-x8-CONTROLE.png` — par refutado, mesmo tratamento

Medição em pixels (0–255), com a janela do espelho definida como x 340–620 / y 480–920 do original 3040×1408:

| par | média DENTRO do espelho | média FORA | máx FORA | % de px FORA com dif > 24 |
|---|---|---|---|---|
| **#52 → #795 (usado)** | **42,7** | **1,02** | **26** | **0,000 %** |
| #52 → #797 (controle refutado) | 1,1 | 4,07 | 212 | 2,602 % |

**Veredito: o par usado PASSA.** No `diff-52-795-x8.png` só a janela do espelho aparece branca; o resto é preto com um chuvisco residual que só surge a ×8 de amplificação (máx 26/255 ≈ 10 %, zero pixel acima disso) — assinatura de recompressão JPEG, não de regeração. No controle, a parede inteira, os quadros, as plantas e o sofá acendem: o #797 regenerou a cena, como o slate já dizia. A prova visual do Reel é honesta.

Reforço editorial: a legenda **não** promete "pixel a pixel" nem "o resto não muda nada" em absoluto; descreve o mecanismo (alteração localizada) e convida o espectador a conferir o plano aberto.

## QA visual — frame a frame

Frames em `qa-frames/` (10 tempos), folha de contato em `qa-sheet.jpg`. Lidos um a um em resolução plena:

- **t=0,70 s** (antes, close) — espelho ornamentado bem visível na parede. Hook "o espelho sai." em branco, topo em ~y=330, dentro da zona segura. Eyebrow EDITAR · REMOVER em ~y=1545, com os dois fios de 0,5 px. Contraste ok sobre a parede clara graças ao scrim do `hook-fixed`.
- **t=1,65 s** (meio do wipe 1) — régua branca em ~x=500. À esquerda o antes (espelho cortado ao meio pela régua), à direita o depois (parede limpa). **Alinhamento perfeito**: o topo do buffet, o canto da parede, a porta e o violão atravessam a régua sem degrau. Só o eyebrow na tela — nenhum texto é atravessado pelo wipe.
- **t=2,40 s** (depois, close) — espelho ausente; tomada, porta, buffet, violão, quadros e pendente idênticos. Hook em duas linhas: "tirou o espelho." branco + "não a parede." em cinza terciário (`[trecho]`), como a 2ª linha do hero da landing. Legível e inteiro.
- **t=4,35 s** (fim do close, kenburns em 1,05) — texto na mesma posição, sem corte nem invasão de zona segura.
- **t=4,45 s** (banda, antes) — corte seco do close para o plano aberto. A sala inteira aparece; o espelho está lá, pequeno, no canto esquerdo. Banda em y=656..1264, não esticada (recorte 16:9 de um original 2,16:1, aspecto preservado). Só o eyebrow — 1,4 s de respiro antes do payoff.
- **t=5,00 s** (banda, antes) — idem, estável.
- **t=5,50 s** (meio do wipe 2) — régua em ~x=535. **Nada muda através da régua**: sofá amarelo, cozinha, plantas, tapete, quadros e piso são contínuos. É exatamente a prova do "o resto ficou." — a régua passa e o espectador não acha diferença.
- **t=6,40 s** (banda, depois) — espelho sumiu do canto esquerdo. Hook "o resto ficou." em ~y=545; eyebrow em ~y=1345; sub "marcou a área, disse o que muda." em ~y=1408, **"área" é a única palavra verde da peça**. Tudo dentro de 220–1600.
- **t=8,00 s** — mesmo card com kenburns, sem deriva de texto.
- **t=9,00 s** (card final) — logo ConstellationN monocromático + "spacenode", pílula branca "Veja no seu próprio projeto →" (CTA da lista aprovada) e microcopy "80 nodes grátis · sem cartão · em português". Sem URL na arte. Tudo entre y≈800 e y≈1140.

### Checklist da casa

- [x] Texto só entre y=220 e y=1600 em todos os frames.
- [x] Hook ≤8 palavras, minúsculas, com ponto final, sem exclamação: "o espelho sai." (3) / "tirou o espelho. não a parede." (5) / "o resto ficou." (3).
- [x] No máximo uma palavra verde por card — só "área" no card `resto`; os demais não têm verde.
- [x] CTA da lista aprovada: "Veja no seu próprio projeto".
- [x] Antes/depois do mesmo projeto e mesma câmera (mesma janela de recorte nos dois assets).
- [x] O wipe atravessa a imagem, nunca o texto; troca de texto sempre em corte.
- [x] "IA" não é o assunto; sem hype, sem números inventados, sem oferta de 50 %, sem "Lumens", sem plano Office, sem menção ao plugin do SketchUp.
- [x] Sem áudio, 1080×1920, 30 fps, H.264 yuv420p.

## Defeito encontrado e corrigido (2 rodadas de render)

**Rodada 1** — medi o brilho médio por frame do mp4 inteiro (`scale=1:1` + leitura do raw gray). Apareceu um **piscar escuro de 1 frame** nos dois extremos do wipe principal:

```
t=1,40 s → frames 40..44: 71 71 58 71 71   (queda de 13/255 em 1 frame)
t=1,90 s → frames 55..59: 77 77 65 77 77   (queda de 12/255 em 1 frame)
```

Causa: os `overlays` são fatiados com `enable=between(t,from,to)`, que é **inclusivo nas duas pontas**. Como `antes` terminava em 1,40 e `veil` começava em 1,40 (e o mesmo em 1,90 entre `veil` e `hook`), os dois cards — ambos com `scrim: true` — ficavam compostos no mesmo frame e o scrim escurecia em dobro. Justamente no frame em que o espectador está mais atento (início e fim do wipe).

**Correção (dentro do spec, sem tocar no kit)**: encerrar os cards de texto mutuamente exclusivos 1 frame antes da fronteira — `antes` 0→1,38 · `veil` 1,40→1,88 · `hook` 1,90→4,38 · `eyebrowBand` 4,40→5,78. O overlay `scrim` (4,40→8,40) segue sobreposto a `eyebrowBand`/`resto` de propósito: é camada própria, como manda o BRIEF.

**Rodada 2 (final)** — mesma medição:

```
t=1,40 s → 71 71 70 71 71   (limpo)
t=1,90 s → 77 77 77 77 77   (limpo)
t=4,40 s → 78 78 77 51 51   (corte para a banda escura — escurece, não estoura)
maior salto entre frames vizinhos em toda a peça: 32, no frame 252 (t=8,40 s) = o corte pretendido para o card final
brilho médio min/máx da peça: 19 / 78 → nenhum frame branco, nenhum flash claro
```

Conferi de novo os 10 frames da rodada 2 (folha `qa-sheet.jpg`): conteúdo idêntico ao da rodada 1, defeito eliminado. **Nenhuma outra correção foi necessária — parei em 2 rodadas.**

### Percalço de infraestrutura (não é defeito da peça)

A sessão anterior foi interrompida no meio de um render e deixou lixo em `%TEMP%\spacenode-marketing\<slug>\`. O primeiro `reel-spec.mjs` desta sessão morreu com `Invalid NAL unit size` / `Error splitting the input into NAL units` ao ler os `seg-*.mp4` remanescentes. **Receita:** apagar `%TEMP%\spacenode-marketing\<slug>\` antes de re-renderizar depois de uma interrupção. (Também vale saber: o `ls` do Git Bash chegou a reportar o mp4 com 0 e com 48 bytes por cache de diretório do Windows; `stat -c %s` e o `ffprobe` mostravam o tamanho real.)

## Versão paga — decisão

**Não foi gerado um cutdown separado. O próprio `2026-09-04-reel-editar-tirou-o-espelho.mp4` serve como criativo pago.** Motivos:

1. Dura **9,70 s**, dentro do teto de 15 s para anúncio.
2. Roda com **som off** e legenda embutida — não depende de áudio.
3. O card final já traz um CTA da lista aprovada ("Veja no seu próprio projeto"), compatível com o botão **LEARN_MORE**; para o ângulo de prazo, que promete o cadastro grátis, o botão é **SIGN_UP** e a microcopy "80 nodes grátis · sem cartão" já está na arte.
4. O gancho útil acontece nos primeiros 2,4 s (mostra o espelho, anuncia a remoção, entrega) — não há gordura para cortar sem perder a prova do plano aberto, que é o argumento central da peça.

Os três ângulos de texto (fidelidade / prazo / apresentação) estão em `caption.txt`, no bloco **VERSÃO PAGA**, com título ≤40 e descrição ≤30 já medidos:

| ângulo | título | chars | descrição | chars | botão |
|---|---|---|---|---|---|
| fidelidade | a edição fica onde você marcou. | 31 | sem regerar o ambiente | 22 | LEARN_MORE |
| prazo | ajuste pontual, em minutos. | 27 | 80 nodes grátis, sem cartão | 27 | SIGN_UP |
| apresentação | corrige a imagem, não o projeto. | 32 | visualização arquitetônica | 26 | LEARN_MORE |

Nos três, o gancho cabe inteiro nos ~125 caracteres visíveis antes do "Ver mais".

## Legenda

`caption.txt`. Gancho de 70 caracteres na 1ª linha ("tirou o espelho. não a parede — a edição ficou dentro da área marcada."), 4 parágrafos curtos, CTA "Veja no seu próprio projeto — link na bio." e 5 hashtags técnicas (#arquitetura #visualizacaoarquitetonica #renderizacao #sketchup #arquiteturadeinteriores).

Palavras-chave de busca em texto corrido, conforme apontado pelo crítico: **"render com IA"** e **"visualização arquitetônica"** aparecem na mesma frase do 4º parágrafo. "SketchUp" só aparece como hashtag — no corpo a frase é "não precisa voltar ao modelo 3D", para não sugerir o plugin (ver gating abaixo).

## Ressalvas e gating

- **Permissão da imagem / origem do print.** #52 e #795 são geração real do dono na plataforma (tabelas `renders` e `edit_v3_jobs`, contas internas). É um projeto de interiores com autoria de terceiros por trás do modelo. **Antes de publicar, o dono precisa confirmar que tem autorização do cliente/autor do projeto para exibir esta sala publicamente** — o acervo não registra esse consentimento.
- **Plugin do SketchUp: fora da peça de propósito.** O .rbz ainda não foi assinado na Trimble e o dono não fez o smoke pago da 0.7. Nem a arte nem a legenda mencionam o plugin; "SketchUp" entra só como hashtag de busca, o que não é claim de produto.
- **Nenhum claim de tempo na arte.** A legenda paga (ângulo prazo) usa "em minutos", que é o único claim de tempo aprovado pelo dono. Nenhum número de %, de horas economizadas ou de clientes.
- **Escopo da prova.** O diff prova a fidelidade **desta** edição. A legenda descreve o mecanismo do Editar (alteração localizada, sem regerar o ambiente) sem prometer que toda edição sai assim — e evita "pixel a pixel" e absolutos como "o resto não muda nada".
- **Módulos citados.** Só o Editar. Nada de Isométricas / Prancha IA / Moodboard (desligados).
- **Nada de repositório compartilhado foi alterado por mim**: o kit (`marketing/scripts/lib/*`), o BRIEF e `roteiros.mjs` não foram tocados nesta sessão. A correção do piscar foi feita só em `spec-src.json`. Os diffs de QA ficaram em `qa-diff/`, dentro da pasta da peça.
- **Sessão paralela mexendo no kit.** `marketing/scripts/lib/reel-kit.mjs` e `REEL-KIT.md` foram modificados por outra sessão às 13:22 (não por mim). O mp4 entregue foi gerado às **13:24:51**, ou seja, já com essa versão do kit, e os frames que inspecionei (`qa-sheet.jpg`, 13:24:54) são exatamente os do arquivo em disco. Se o kit mudar de novo, **não é preciso re-renderizar** esta peça — mas vale reconferir os frames antes de qualquer novo render a partir deste spec.
