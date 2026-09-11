# Reels de USO do SPACENODE — web app + plugin (2026-09-09)

## Plugin SketchUp (feitos, capturas reais de 07/09, saldo mascarado)

| Reel | Duração | Ensina |
|---|---|---|
| 2026-09-09-reel-plugin-preco-antes-do-clique | 13,8 s | ambiente/luz → motor → o custo no botão antes de gerar → resultado |
| 2026-09-09-reel-plugin-o-render-chegou | 10,6 s | ações depois do render: baixar, abrir no site, ampliar 2×/4×, animar, comparar |
| 2026-09-09-reel-plugin-camera-que-voce-enquadrou | 12,2 s | aba Fotografia: proporção, lente, altura do olho, guias, espelhos/vidros → mesma câmera no render |
| 2026-09-07-reel-plugin-no-sketchup (regerado) | 12,6 s | fluxo completo com capturas reais, agora sem saldo à mostra |
| 2026-09-07-reel-plugin-render-real (regerado) | 15,0 s | geração real em time-lapse, agora sem saldo à mostra |

Specs: `marketing/specs/2026-09-09-uso/` e `marketing/specs/2026-09-07-plugin-real/`.
Fontes: `marketing/output/2026-09-07-reel-plugin-no-sketchup/src/masked/` (drawbox sobre saldo)
+ recortes nativos `crop-*.png` para os close-ups.

## Web app (roteiros prontos, aguardando captura logada)

Os 8 roteiros verificados de 08/09 (`marketing/output/2026-09-08-tutoriais/PROGRAMA.md`) continuam
valendo: Renderizar, Histórico, Ampliar, Primeiros passos, Planta humanizada, Animar, Editar V3, Spaces.

Captura (uma vez, o dono loga na janela do Chrome):

```bash
node marketing/scripts/produto/capturar.mjs --login --chrome
node marketing/scripts/produto/capturar.mjs --app --chrome --vw 900 --vh 1400 --data 2026-09-09
```

Regras antes de montar: mascarar avatar/nome e "N nodes" da sidebar, saldo em rodapés, nomes de
projetos reais no Histórico; nunca clicar em passo `"paga": true`.
