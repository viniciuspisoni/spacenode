# Montagem: reel-kit, cinema-kit ou Remotion

A SpaceNode tem **três** montadores instalados e funcionando. O erro caro é usar
o errado. Este arquivo decide e explica como dirigir cada um.

---

## 1. A decisão

```
A peça é 9:16 feita de stills + clipes + cards de texto?
   → REEL-KIT (ffmpeg). É o padrão. Use este.

A peça é 16:9 (filme de apresentação, YouTube, site)?
   → CINEMA-KIT (ffmpeg). Mesmo modelo de spec, quadro 1920x1080,
     com patch "vertical" para tirar o corte 9:16 do mesmo arquivo.

A peça precisa de animação que um card estático não faz?
   → REMOTION. Só nestes casos:
       - UI do app se montando/animando (elementos entrando em sequência)
       - contador, número subindo, barra de progresso
       - tipografia com choreography real (stagger palavra a palavra, máscara)
       - gráfico, diagrama, ilustração animada
       - lógica de composição que muda com dados
```

Regra de contenção: **não use Remotion por poder usar.** Se o resultado final é
o mesmo que um card PNG sobre um still, o reel-kit entrega em 20 segundos de
render e sem um projeto novo para manter. Less, but better.

## 2. REEL-KIT — o caminho padrão

Documentação completa e atualizada: **`marketing/scripts/REEL-KIT.md`**. Leia-a
antes de escrever um spec; ela é a fonte de verdade, este resumo não é.

```bash
node marketing/scripts/reel-spec.mjs caminho/spec.json --plan   # timeline, sem render
node marketing/scripts/reel-spec.mjs caminho/spec.json          # renderiza
node marketing/scripts/reel-spec.mjs --exemplo                  # spec completo de exemplo
```

Saída em `marketing/output/<slug>/`: `<slug>.mp4` (1080×1920, 30fps, H.264
crf 18, yuv420p, **sem áudio**), `qa-frames/*.png`, `probe.json`, cópia do `spec.json`.

**Sempre rode `--plan` antes de renderizar.** Ele imprime onde cada segmento
começa — é como você acerta os tempos globais dos `overlays`.

Vocabulário que a direção usa mais:

| Recurso | Para quê |
|---|---|
| `type: still` + `kenburns`/`pan`/`panY` | movimento de câmera sem IA, sem custo |
| `type: video` | entrar com um take gerado ou um vídeo do Animar |
| `type: split` | antes/cima, depois/baixo, mesma câmera — o pilar fidelidade |
| `type: grid` | mosaico que se preenche — a mecânica de escala ("nove luzes") |
| `type: card` | placa de texto (é um segmento, não um overlay) |
| `overlays` | texto por cima, em **tempo global** — troca em corte |
| `transitions[].ruler` | a régua branca no wipe — assinatura visual da fidelidade |
| `fit: band / cover / contain` | preservar enquadramento do arquiteto vs full-bleed |
| `accent: false` | neutraliza o verde na peça inteira |

Especificidades que economizam retrabalho:
- `transitions` precisa ter **exatamente** `segments.length - 1` entradas.
- Cada `xfade` precisa de `dur` ≤ à duração dos dois segmentos vizinhos.
- Caminhos versionados usam `$ACERVO` e `$REPO`, expandidos na leitura.
- O texto vai em `overlays` (global), nunca dentro do segmento — é assim que o
  wipe atravessa a imagem sem atravessar o texto.

## 3. CINEMA-KIT — 16:9

```bash
node marketing/scripts/cinema.mjs caminho/spec.json --plan
node marketing/scripts/cinema.mjs caminho/spec.json              # master 16:9
node marketing/scripts/cinema.mjs caminho/spec.json --vertical   # corte 9:16
node marketing/scripts/cinema.mjs --exemplo
```

O corte vertical **não é outro spec**: é um patch `"vertical": { ... }` dentro do
mesmo arquivo, com `segmentPatch` por índice. Master e corte nunca saem de
sincronia. Se você se pegar criando dois specs, está fazendo errado.

Layouts próprios: `line`, `lower` (lower-third), `scrim`, `final`, `black`.

## 4. REMOTION — quando o movimento é o conteúdo

Instalado no repo: `remotion@^4.0.523`, `@remotion/cli`, `@remotion/renderer`,
`@remotion/media-utils`. **Não existe projeto Remotion scaffoldado ainda** — a
primeira peça que precisar dele cria a estrutura.

Antes de escrever uma linha de Remotion, invoque a skill
`remotion-motion-graphics` e leia as regras não negociáveis dela. Elas existem
justamente para evitar o "look de vídeo de IA" que o `brand.md` proíbe. As que
mais batem com a SpaceNode:

- nunca interpolação linear; `spring()` na entrada, sempre com `clamp`;
- entrada anima 2–3 propriedades juntas (opacity + translateY + scale);
- stagger de 3–6 frames, nada entra ao mesmo tempo;
- saída existe e é mais rápida que a entrada;
- todo still ganha Ken Burns; todo vídeo usa `<OffthreadVideo>`, nunca `<Video>`;
- um único objeto de tema no topo do projeto — nunca hex inline;
- timing derivado de `useVideoConfig()`, sem número mágico de frame;
- renderizar, extrair frames, **olhar**, corrigir, re-renderizar.

Adaptação SpaceNode: a regra 5 daquela skill manda "nunca fundo chapado, sempre
mesh de fundo". **Aqui não.** O fundo da SpaceNode é `#0A0A0A` limpo ou o
material de vidro do app. Mesh colorido viola `brand.md`. Quando as duas skills
discordarem em estética, `brand.md` ganha; quando discordarem em técnica de
animação, a skill do Remotion ganha.

Render:
```bash
npx remotion render src/index.ts <CompId> out/video.mp4 --codec h264 --crf 17
```
O Remotion precisa de um Chromium. O repo já tem Playwright + Chromium como
devDependency — se o download automático falhar, aponte o executável com
`--browser-executable=<path>`.

## 5. ffmpeg neste repo

`ffmpeg` veio do winget e **pode ou não estar no PATH, dependendo do shell** —
funciona em alguns e falha em outros, então não confie. Use sempre
`marketing/scripts/lib/tools.mjs`, que resolve o binário (env `FFMPEG`/`FFPROBE`
→ PATH → diretório de pacotes do winget). Para QA, `scripts/qa-frames.mjs` já
faz isso por você.

Armadilhas já pagas:
- O diretório de trabalho em `%TEMP%/spacenode-marketing/<slug>/` é **apagado no
  início de cada render**. Um render interrompido no meio deixava segmentos
  truncados que quebravam a execução seguinte com
  `Error splitting the input into NAL units`.
- `concat` seguido de `xfade` exige `settb=AVTB` nos dois ramos (o kit já faz).
- Se o processo for morto durante a escrita, o `.mp4` pode ficar **corrompido
  existindo em disco**. Confira sempre:
  ```bash
  ffprobe -v error -show_entries format=duration -of csv=p=0 arquivo.mp4
  ```
- Texto na tela **nunca** com `drawtext` (kerning ruim). Card = HTML com Geist →
  screenshot Playwright → PNG. Os kits já fazem isso.

## 6. Entrega

Toda peça vai para `marketing/output/AAAA-MM-DD-<slug>/` com:
- o(s) `.mp4` final(is)
- `caption.txt` — legenda pronta + 5–8 hashtags do pool do BRIEF
- `QA.md` — checklist de `qa.md` preenchido
- `spec.json` — o spec que gerou a peça (os kits já copiam)

`marketing/output/` está no `.gitignore` (centenas de MB, regenerável). **O spec
é o artefato versionável**, não o mp4: specs vivem em `marketing/specs/`.
