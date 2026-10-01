# Blocos 3D V2 — decisão provisória e validação

## Experiência

Uma foto de um objeto isolado basta para gerar um GLB texturizado. O usuário
pode acrescentar vistas na ordem frente → esquerda → trás → direita. O motor
e seus parâmetros são internos. Não há mais três preços nem prompt técnico.
O Tripo estima dimensões em metros, mas a interface orienta conferir a medida
antes de usar o modelo em um projeto executivo.

O backend aceita apenas `quality=standard` (ou sem `quality`) em novas
requisições. `high` e `premium` permanecem no catálogo para histórico. O
`provider` e o endpoint efetivo continuam persistidos por job, permitindo
consultar jobs anteriores mesmo após a troca de motor.

## Motor e custo

Tripo H3.1 via fal, com PBR, textura `detailed`, geometria `standard` e
`auto_size`: **US$0,40** tanto para uma imagem quanto para multiview. Não
habilitar `geometry_quality=detailed` ou `quad` sem recálculo: a fal soma
US$0,20 e US$0,05, respectivamente.

Fontes verificadas em 2026-10-01:

- [H3.1 single: preço](https://fal.ai/models/tripo3d/h3.1/image-to-3d)
- [H3.1 multiview: preço](https://fal.ai/models/tripo3d/h3.1/multiview-to-3d)
- [H3.1 multiview: ordem e schema](https://fal.ai/models/tripo3d/h3.1/multiview-to-3d/api)

### API direta da Tripo versus fal (consulta em 2026-10-01)

A [tabela oficial do H3.1](https://developers.tripo3d.ai/en/models/v3-1)
marca 40 créditos para uma imagem ou multiview com textura detalhada; na
[conversão publicada de 100 créditos por US$1](https://developers.tripo3d.ai/en/pricing),
isso equivale a US$0,40. A fal publica os mesmos US$0,40 para a mesma
configuração. Geometria detalhada acrescenta 20 créditos/US$0,20 em ambas.
Sem desconto contratado ou diferença real na fatura, migrar para a API
direta não aumenta a margem projetada dos 190 nodes nem muda o modelo.

A API direta permite fixar o snapshot `v3.1-20260211`, consultar
`credits_consumed` por tarefa e usa crédito congelado que é liberado quando
a tarefa falha. A fal também não cobra falha de infraestrutura (HTTP 500+),
embora uma falha de entrada detectada após uso de GPU possa ser cobrada.
Portanto, não presumir economia da API direta com falhas; conferir eventos
faturados por requisição. Os 12% de reserva permanecem para entregas
estornadas após uma geração bem-sucedida, storage e demais variações.

A troca de transporte exigiria uma chave `TRIPO_API_KEY`, adaptar submissão
e polling, autorizar a origem dos arquivos da Tripo no rehost, registrar
`provider=tripo` na persistência e preservar a reconciliação dos jobs fal
existentes. A API direta limita H-series a três tarefas simultâneas por
conta. Manter fal na produção deste PR. O harness já pode comparar `h31` (fal)
com `h31_direct` (Tripo), com os mesmos parâmetros, fotos, notas e teto
cumulativo. Só considerar a troca após conciliar custo faturado, latência,
falhas e arquivos GLB no mesmo conjunto de fotos.

### Alternativas recentes (consulta em 2026-10-01)

| Motor fal com PBR/textura | Custo por geração | Nodes para 80% no piso legado | Margem se cobrar 190 nodes |
| --- | ---: | ---: | ---: |
| H3.1 detailed | US$0,40 | 190 | 80,2% |
| [Tripo P1 com textura](https://fal.ai/models/tripo3d/p1/image-to-3d) | US$0,50 | 235 | 75,4% |
| [Tripo P2 detailed](https://fal.ai/models/tripo3d/p2/image-to-3d) | US$1,20 | 560 | 41,4% |
| [Hi3D v3.0 quality](https://fal.ai/models/hitem3d/hi3d/v3.0/image-to-3d) | US$2,10 | 975 | -2,2% |

A régua usa câmbio de proteção R$6/US$, reserva de 12%, R$0,05 por
armazenamento, piso de R$0,0729/node e arredondamento para 5 nodes. O P1
consultado na fal é single-image; não substitui diretamente as quatro vistas.
P2 e Hi3D v3.0 podem entrar em um produto de preço diferente se superarem
visualmente o H3.1, mas não cabem na cobrança atual. Não há avaliação de
qualidade dessas alternativas no conjunto de objetos de arquitetura.

`lib/blocos3d/pricing.ts` é a fonte da cobrança. Calcula no piso de
R$0,0729/node (Office anual legado), câmbio de proteção R$6/US$,
12% de reserva para gerações falhas estornadas e custo variável, além de
R$0,05 de rehost/storage. Arredonda para cima em grupos de 5 nodes.

| Caso | Receita | Custo estimado | Margem estimada |
| --- | ---: | ---: | ---: |
| Piso legado, 190 nodes | R$13,851 | R$2,738 | 80,2% |
| Studio mensal, 190 nodes | R$18,953 | R$2,738 | 85,6% |

Margem é **estimativa de custo variável por geração entregue**. Os 12% são
uma hipótese, ainda sem amostra suficiente de falhas; não incluem imposto
sobre receita, CAC ou custo fixo. Se a taxa de falha cobrada pelo provider
chegar a 20%, a margem no piso fica aproximadamente 78%; acima de 30%,
fica abaixo de 75%. Recalibrar pelo custo faturado, não só pelo preço de
catálogo. Revisar o preço se fal, câmbio, planos ou custos de storage mudarem.

## Qualidade e falhas

Antes de cobrar, o servidor verifica que todas as fotos abrem e têm ao
menos 512 px em cada eixo. Depois da geração, seleciona o GLB PBR da
resposta, verifica a estrutura, geometria e textura do GLB, e só conclui
quando o arquivo está salvo no Storage privado. Se o provider devolver um
modelo inválido, o job falha e os nodes são estornados. Falhas transitórias
de armazenamento são tentadas novamente pelo polling e pelo cron de 10 em
10 minutos; após 1h, falham e estornam. O cron finaliza também os jobs de
quem saiu da página. O débito e a entrega deixam de depender da aba aberta.
Não há segunda geração paga automática. Estornos cujo RPC falhar ficam
registrados como `failed AND charged AND NOT refunded` para reconciliação
operacional; o cron não os repete sem garantia de idempotência do débito.

O GLB principal tenta simplificar a malha para aproximadamente 150 mil
triângulos, preservando materiais e texturas, e guarda o original como download
separado. A otimização só se aplica ao H3.1 e recua para o original se não
diminuir tamanho/triângulos, perder texturas ou encontrar extensões glTF
que o processador não suporte. Em uma amostra pública do H3.1, passou de
1.441.189 triângulos e 43 MB para 144.115 triângulos e 6,3 MB; isso não é
uma garantia para outros objetos. Conferir aparência e importação no benchmark.

Essa inspeção detecta arquivos incompletos, mas **não mede fidelidade** à
foto, malha editável, número real de faces, escala exata nem aparência no
SketchUp. A escolha de H3.1 é uma candidata baseada no schema, preço e no
uso anterior do Tripo; ainda depende de avaliação visual com objetos reais.

## Portão de lançamento

Antes de habilitar em produção: montar 10–12 objetos de arquitetura com
fotos próprias/licenciadas (cadeira, sofá, mesa, luminária, vaso, peça
vazada e elemento de fachada); pelo menos 4 com quatro vistas. Rodar H3.1 via fal e via Tripo direto
contra Hunyuan3D 3.1 Pro e Rodin 2.5 com teto total de US$60, guardar
provider, preço efetivo, tempo, falha e GLB. Avaliar às cegas as vistas do
modelo contra a referência, importação em SketchUp, materiais e tamanho.
Escolher o motor que passar o limiar de qualidade e a conta de margem;
recalcular nodes antes de trocar endpoint. O run pago não foi realizado neste
ambiente: não há `FAL_KEY`, `TRIPO_API_KEY` nem as fotos de teste aqui.

O runner e a régua de avaliação estão em `scripts/blocos3d-harness/README.md`.
Ele conserva as fotos, tenta salvar a prévia de cada motor, inspeciona dimensões
e mapas PBR do GLB e produz `review.html` para comparar os resultados. A prévia
não substitui girar o modelo e importá-lo no software de projeto.
Seu plano sem `--execute` não faz chamadas pagas. A estimativa do lote varia
com o número de fotos: em 12 objetos, com quatro multiview, os três modelos
somam cerca de US$16,50; reservar até US$60 deixa espaço para pilotos ou
repetições **manuais**, sempre após conferir o plano exibido.
