# marketing/remotion — montagem em Remotion

Primeiro projeto Remotion do repo (criado em 2026-09-11 para a campanha "Seu projeto, em
cena."). Entra aqui só o que o reel-kit e o cinema-kit não fazem: UI se encaixando e rolando,
régua dentro de um retângulo da UI real, marcações desenhadas, split com o mesmo recorte.

```
src/
  Root.tsx            composições (V1 + aberturas A/B, V2, V3), 1080×1920 @30
  theme.ts            cores, tipos, easings, springs, zona segura, geometria do painel
  fonts.ts            Geist variável (public/brand/*.woff2), a mesma do app
  components/         Picture (Cover, Band, RulerWipe, RegionView), Typo, Brand, Plugin, Marks, Sound, Layers
  videos/             V1.tsx, V2.tsx, V3.tsx — a timeline de cada peça
public/
  brand/              fontes + SVGs do logo (versionado)
  assets/             imagens e vídeo da peça (gitignored — regenerar com tools/prepare-assets.mjs)
  audio/              trilha e efeitos sintetizados (gitignored — node tools/synth-audio.mjs)
tools/
  synth-audio.mjs     gera os WAVs deterministicamente (sem sample de terceiros)
  prepare-assets.mjs  copia/recorta/amplia o material real para public/assets
render.mjs            renderiza tudo (com áudio + mudo) em marketing/output/2026-09-11-campanha/
```

## Rodar

```bash
node marketing/remotion/tools/synth-audio.mjs
node marketing/remotion/tools/prepare-assets.mjs
node marketing/remotion/render.mjs            # tudo · --half para QA rápido · "V3" para filtrar
```

Studio: `cd marketing/remotion && npx remotion studio src/index.ts --public-dir "$PWD/public"`.

## Armadilhas já pagas

- O Remotion acha a raiz pelo `package.json` mais próximo (a raiz do repo), então o `public/`
  daqui precisa ser passado por `--public-dir` (o `remotion.config.ts` não é lido de subpasta).
  `render.mjs` já faz isso.
- Saída padrão vinha `yuvj420p` (full range). `--color-space bt709` entrega `yuv420p` bt709.
- O mix sintetizado sai a ≈ −25 LUFS; `render.mjs` normaliza com `loudnorm` só no áudio
  (vídeo copiado bit a bit) e gera a versão muda com `-an`.
- `marketing/remotion` está no `exclude` do `tsconfig.json` da raiz para não entrar no build
  do Next; o typecheck local é `npx tsc -p marketing/remotion/tsconfig.json`.
- Regras que valem aqui e vieram do `brand.md`: fundo `#0A0A0A` chapado (sem mesh), sem grão,
  sem verde, um movimento por take, Ken Burns ≤ 1,08 nos hero shots.
