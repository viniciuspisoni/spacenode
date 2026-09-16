# Specs dos Reels

Cada `.json` aqui é a receita completa de um Reel para `marketing/scripts/reel-spec.mjs`
(formato em `marketing/scripts/REEL-KIT.md`). Os mp4 renderizados ficam em
`marketing/output/` e **não** são versionados; qualquer peça se regenera em ~10 s a partir
do spec.

```bash
set SPACENODE_ACERVO=D:\spacenode-acervo          # raiz do acervo baixado (fora do repo)
node marketing/scripts/reel-spec.mjs marketing/specs/2026-09-05-organico-1/adivinhe-o-antes.json
```

## `$ACERVO`

Os specs referenciam as imagens da conta do dono como `$ACERVO/assets/<idx>-<kind>-<role>.<ext>`.
`reel-spec.mjs` substitui `$ACERVO` por `SPACENODE_ACERVO` (default: `../acervo`, ao lado do
repositório). O acervo é gerado por:

```bash
node marketing/scripts/acervo/inventory.mjs --download   # lê o Supabase de PROD (.env.local), baixa ~800 assets
node marketing/scripts/acervo/pairs.mjs                   # folhas de pares antes→depois para triagem visual
node marketing/scripts/plugin/capture-states.mjs          # estados do painel do plugin → $ACERVO/plugin/shots/
```

O índice `assets.json` mapeia `idx` → tabela/linha do banco, dimensões e caminho; o `idx` é
estável enquanto o inventário for gerado a partir do mesmo banco na mesma ordem. Se o acervo
for regenerado com novas imagens, confira os `idx` citados nos specs antes de renderizar.

## Rodadas

| pasta | o que é |
|---|---|
| `2026-09-04-slate/` | 14 Reels do slate (workflow de triagem → conceitos → júri → refutação → produção). Os specs foram escritos pelos agentes de produção; alguns usam recortes pré-processados em `src/` dentro da pasta de saída original — esses precisam do pré-processamento descrito no `QA.md` da peça. |
| `2026-09-05-organico-1/` | 9 Reels orgânicos, ganchos de retenção, sem verde |
| `2026-09-05-organico-2/` | 9 Reels orgânicos, ganchos e assets novos |
| `2026-09-05-organico-3/` | 9 Reels orgânicos com os assets restantes |
| `2026-09-05-plugin/` | 6 Reels do plugin SketchUp com o painel real (`capture-states.mjs`) |

Regras que valem para todos: antes/depois sempre do mesmo projeto e mesma câmera; nada de
imagem gerada fora da plataforma; texto só dentro da zona segura (220–1600); CTA da lista
aprovada; sem léxico proibido (`docs/marketing/prohibited-content.md`).
