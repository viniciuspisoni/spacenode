# SpaceNode 3.0 · Animar

O Animar transforma uma vista do projeto em um take contínuo de arquitetura. A primeira decisão de produto é medir a fidelidade ao projeto e quanto custa cada take aprovado. O piloto roda pela API, usa quatro referências da SpaceNode e gera arquivos para revisão cega. Os critérios abaixo orientam a próxima integração com o módulo web.

## Duas camadas

| Camada | Entrada | Saída |
| --- | --- | --- |
| Direção arquitetônica | Print ou render, tipo de take, proporção escolhida, âncoras visíveis e segundo quadro quando aplicável | Brief versionado com um movimento, enquadramento e regras de preservação |
| Geração de vídeo | Imagem inicial e brief de direção | Um take de 5 s pelo perfil selecionado, identificado por provedor, modelo, versão, parâmetros e custo |

Para quem já tem um render, o módulo recebe a imagem pronta. Um print técnico conserva a aparência da vista. Se o usuário quiser um take fotorrealista, o Renderizar 3.0 pode produzir o primeiro quadro para aprovação e repassá-lo ao Animar. Essa passagem é opcional e tem orçamento próprio.

Na interface, a pessoa escolhe **imagem → take → formato → gerar**. A sugestão de take aparece só depois que a imagem chega, explica o movimento em uma frase e respeita a escolha manual. A prévia mostra o recorte final em 16:9 ou 9:16 antes do débito. O preço aparece em Nodes junto ao botão. O catálogo de modelos pode ficar em ajustes avançados após a validação das rotas.

| Take | Quando oferecer | Direção |
| --- | --- | --- |
| Aproximar da cena | Sala, hall, circulação | Avanço curto à altura da vista com verticais estáveis |
| Deslizar de lado | Cozinha, marcenaria, ambiente com camadas | Translação lateral curta com paralaxe contida |
| Revelar a fachada | Elevação ou perspectiva externa | Arco curto sobre o volume já visível |
| Mostrar um detalhe | Revestimento, marcenaria, luminária | Aproximação suave mantendo acabamento e foco |
| Manter a câmera fixa | Vegetação ou água já visível | Câmera travada com movimento só no elemento escolhido |
| Conectar duas vistas | Duas imagens reais do mesmo espaço | Take curto do quadro inicial ao final, após validar a compatibilidade das vistas |

A primeira matriz cobre os quatro primeiros tipos. Câmera fixa e conexão entre duas vistas entram em rodadas próprias. Movimentos que exigem atravessar portas, dar a volta no prédio ou ver áreas ocultas ficam para entradas com vistas reais suficientes. Os presets se inspiram em práticas de câmera e keyframes de archviz. A demanda por cada opção deve ser conferida nas primeiras sessões de uso com arquitetos. [Enscape](https://docs-chaos.atlassian.net/wiki/spaces/EREVIT/pages/128385759/Video%2Bin%2BEnscape)

## Modelos e seu papel no piloto

Preços públicos por take de 5 s consultados em 26/11/2026. A classificação pública de imagem para vídeo orienta a seleção. A escolha para a SpaceNode depende da avaliação em fachadas e interiores. [Artificial Analysis](https://artificialanalysis.ai/video/leaderboard/image-to-video)

| Modelo e configuração | US$/tentativa | Nodes simulados | Papel |
| --- | ---: | ---: | --- |
| [Kling 2.5 Turbo Pro · fal · 1080p](https://fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/image-to-video) | 0,35 | 65 | Referência de custo e motor existente |
| [MiniMax H3 Max · fal · 768p](https://fal.ai/models/minimax/h3-max/image-to-video) | 0,40 | 75 | Candidato econômico |
| [Kling 4.0 · fal · 720p](https://fal.ai/models/kling/v4/image-to-video) | 0,785 | 140 | Candidato premium com duração e quadro inicial explícitos |
| [Seedance 2.5 US · fal · 720p](https://fal.ai/models/bytedance/seedance-2.5/us/image-to-video) | ≈ 2,365 | 415 | Referência de qualidade no mesmo formato do Kling 4.0 |
| [Kling 4.0 · fal · 1080p](https://fal.ai/models/kling/v4/image-to-video) | 1,175 | 210 | Variante para comparação posterior em 1080p |
| [MAGI-2 · Higgsfield · 1080p](https://open.higgsfield.ai/models/sand/magi-2/image-to-video/api-reference) | 0,40 | 75 | Candidato prioritário da rodada fora da fal, com uma geração simultânea por conta |
| [Boreal-H3 · Segmind · 768p](https://www.segmind.com/models/boreal-h3-image-to-video/pricing) | ≈ 0,21 | 40 | Candidato econômico adicional, validar estabilidade em arquitetura |

Gemini Omni 1.2 Flash merece uma rodada de avaliação na etapa Google. Veo 3.1 é referência do fluxo anterior e pode entrar como controle pelo Vertex após confirmar o endpoint ativo usado pela SpaceNode. [Google Omni](https://blog.google/innovation-and-ai/technology/developers-tools/introducing-gemini-omni-1-2-flash/) · [PR 250](https://github.com/viniciuspisoni/spacenode/pull/250)

## Economia do Essence anual

R$ 1.341 por ano equivalem a R$ 111,75 por ciclo de 800 Nodes. A receita bruta alocada é R$ 0,13969 por Node em uso integral. A projeção usa câmbio efetivo de R$ 6,00/US$, dedução ilustrativa de 5% da receita, reserva de 15% sobre a inferência para perdas cobradas e US$ 0,02 por entrega para infraestrutura incremental. Os Nodes são arredondados ao próximo múltiplo de cinco. [Tabela aprovada](./PRICING.md)

`Nodes mínimos = arredondar para cima (custo efetivo em BRL / (receita líquida por Node × 0,30))`

`Custo observado por take aprovado = custo efetivamente cobrado por todas as tentativas / quantidade de takes aprovados`

Use o custo observado no preço final e substitua as reservas pela cobrança, pelo câmbio e pela infraestrutura observados. Uma rodada com zero aprovações fica inelegível para orçamento. Enquanto os dados estiverem incompletos o cálculo observado fica inconclusivo. O piso projetado por take protege a contribuição sobre os Nodes alocados. A margem da assinatura inteira exige medir também Renderizar, Editar, Ampliar, armazenamento e custos do ciclo. Contratos com preço legado precisam da receita efetiva dos próprios Nodes. A conta não presume Nodes expirados.

## Primeira rodada por API

São 16 takes de cinco segundos, com o mesmo crop e a mesma direção por cena. Custo estimado de US$ 15,60 e autorização mínima de US$ 17,16 com reserva de orçamento de 10%. A reserva de orçamento é uma estimativa local, e a cobrança é determinada pelo provedor. Os perfis são reportados nas resoluções nativas selecionadas. A comparação de nitidez em condições iguais desta rodada é Kling 4.0 versus Seedance 2.5 a 720p.

1. Rode o planejamento e confira o recorte das quatro referências. A fachada usa o print, cozinha e banheiro usam renders e o corredor testa 9:16. Os cortes são centralizados e aparecem na prévia local.
2. Após aprovar o orçamento e configurar `FAL_KEY` no ambiente local, envie a rodada. O script grava cada ID recebido e coleta os vídeos pela fila. Um envio ambíguo interrompe novas submissões. `--collect` consulta IDs existentes usando GET e pode ser chamado após interrupção.
3. Passe apenas a pasta `review/` para os avaliadores. Assista a cada take inteiro e compare com a referência; inspecione início, 25%, 50%, 75% e fim. Guarde evidência com timestamps. Reprove mudanças de geometria, material, luz/reflexos ou movimento incompatível, cortes e instabilidade perceptível. Avalie com a reprodução silenciada para isolar a imagem.
4. Lance em `jobs.json` o `actualUSD` de cada tentativa pelo ID registrado, inclusive falhas cobradas; use zero apenas quando a cobrança zero estiver confirmada. Rode o consolidado com `--score`.
5. Repita os finalistas em vistas novas e em ambas as proporções. Critério inicial proposto para o padrão do produto: ≥ 90% de takes aprovados e contribuição ≥ 70% no Essence anual, com latência e taxa de falha registradas. Compare também o tempo até o primeiro resultado utilizável. Quatro cenas são uma triagem.

```text
node scripts/animar-v3/pilot.mjs
node --test scripts/animar-v3/verify.mjs
node scripts/animar-v3/pilot.mjs --prepare --out benchmark-output/animar-preview-01
node scripts/animar-v3/pilot.mjs --run --budget-usd 17.16 --out benchmark-output/animar-01
node scripts/animar-v3/pilot.mjs --collect --out benchmark-output/animar-01
node scripts/animar-v3/pilot.mjs --score --out benchmark-output/animar-01
```

Use `--profiles kling25-1080,kling4-1080` no planejamento e no envio de uma rodada separada para comparar os dois Kling em 1080p. O orçamento é recalculado para os perfis escolhidos.

O planejamento, a preparação local, a revisão e os testes do script dispensam conta de API. A preparação e a execução usam `sharp`, dependência existente. O provedor recebe a imagem de referência como data URI. O diretório da rodada precisa ser novo no envio e a coleta usa o mesmo diretório. A seleção do take, os payloads e a análise de custo ficam disponíveis para reutilização em `lib/video/direction-v3.mjs`.

## Integração seguinte

A aplicação já tem upload, histórico, seleção por presets e um endpoint que espera a geração na mesma requisição. A rota de lançamento pode incorporar os padrões de fila e de reconciliação do [PR 250](https://github.com/viniciuspisoni/spacenode/pull/250) e aproveitar o trabalho de interface e preservação do [PR 301](https://github.com/viniciuspisoni/spacenode/pull/301). Antes de abrir o beta, revisar os PRs contra a `main` atual. Persistir cotação e pedido idempotente no servidor, confirmar débito uma vez, reconciliar o resultado, armazenar o vídeo em mídia privada, retirar a trilha de saída do take silencioso e devolver Nodes em falha terminal. Guardar versão de direção, resolução, tempo, custo de cada tentativa e qualificação. O primeiro beta oferece as rotas que passaram no piloto e têm margem medida.
