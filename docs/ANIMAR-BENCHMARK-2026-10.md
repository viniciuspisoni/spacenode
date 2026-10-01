# Benchmark cego do Animar

O piloto usa 12 imagens de demonstração já versionadas neste repositório, sem material de clientes. O script `node scripts/video-benchmark.mjs` confere os arquivos e calcula o custo sem enviar jobs. Com `FAL_KEY` configurada e `--run`, envia uma geração de 8 s, 1080p e sem áudio por cena em cada motor. As tarifas verificadas em 01/10/2026 somam **US$ 24,00 de inferência** para Veo 3.1 Lite e Veo 3.1 completo; upload, armazenamento, câmbio e eventuais reexecuções não estão incluídos.

O script dá a ambos o mesmo recorte de origem, resolução e prompt conservador. Panoramas acima de 2,49 de proporção perdem apenas a pequena faixa lateral necessária. Os vídeos são salvos com nomes aleatórios em `benchmark-output/animar-2026-10/`, junto de `ratings.csv`; `mapping.json` revela o motor e deve ficar oculto dos avaliadores. Se o lote parar no meio, executar novamente retoma apenas os arquivos ausentes. Não alterar prompt ou imagens durante um lote.

| Cena | Arquivo | Risco observado |
| --- | --- | --- |
| Casa | `marketing/renders/depois/casa.jpg` | Volumetria, fachada e aberturas |
| Comercial | `marketing/renders/depois/comercial.jpg` | Fachada larga, caixilhos |
| Coworking | `marketing/renders/depois/coworking.jpg` | Modulação e mobiliário |
| Industrial | `marketing/renders/depois/industrial.jpg` | Linhas longas e estrutura |
| Banheiro | `marketing/renders/depois/banheiro.jpg` | Reflexos e revestimento |
| Cozinha cerâmica | `public/proj-cozinha-ceramica-render.jpg` | Juntas e textura |
| Cozinha ilha | `public/proj-cozinha-ilha-render.jpg` | Bancada e armários |
| Entrada | `public/proj-entrada-corredor-render.jpg` | Perspectiva em profundidade |
| Home office | `public/proj-home-office-render.jpg` | Móveis e esquadrias |
| Living estante | `public/proj-living-estante-render.jpg` | Elementos finos |
| Sala de estar | `public/proj-sala-estar-render.jpg` | Composição de móveis |
| Sala de jantar | `public/proj-sala-jantar-render.jpg` | Cadeiras e iluminação |

## Avaliação

Cada avaliador vê a imagem original ao lado do vídeo, sem saber o motor. Preenche notas de 1 a 5 para geometria (peso 40%), materiais (25%), movimento (20%) e ausência de artefatos (15%). Marca reprovação crítica se aberturas, pavimentos, volumetria ou layout mudarem de modo visível, independentemente da média. Ordenar resultados por cena, comparar as diferenças por pares e registrar motivos. Desocultar o mapa somente depois das notas.

Este piloto mede a diferença entre Lite e completo. A escolha final para produção ainda exige cenas verticais próprias para Reels, repetição em cenas difíceis e confronto com candidatos alternativos. Um MP4 tecnicamente válido não prova fidelidade arquitetônica. O teste pago do fluxo SpaceNode (nodes, histórico e download) é separado deste script.
