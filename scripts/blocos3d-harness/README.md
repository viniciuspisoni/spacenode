# Benchmark Blocos 3D para arquitetura

Coloque fotos próprias ou licenciadas em `objects/<slug>/front.jpg`. Opcionais:
`left.jpg`, `back.jpg`, `right.jpg`, sempre nessa ordem. Aceita JPG, PNG ou
WebP, entre 512 px por lado e 8 MB. Faça 10–12 objetos variados (mobiliário,
luminária, vaso, peça vazada, elemento de fachada); pelo menos quatro com as
quatro vistas. Use fotos de um objeto isolado, com fundo simples e os lados
consistentes. Os arquivos de entrada e resultados ficam fora do Git.

Conjunto piloto pronto: 12 produtos de mobiliário e decoração do Amazon
Berkeley Objects, com 24 fotografias e quatro conjuntos de quatro vistas.
O script baixa os arquivos originais e grava licença CC BY 4.0, nome e URL
de cada foto em `meta.json`. O padrão cria `objects/` (ignorado pelo Git):

```bash
node scripts/blocos3d-harness/fetch-abo.mjs
```

O conjunto também está disponível como arquivo compactado junto da revisão.
Ele cobre produtos isolados de catálogo; fotos próprias de peças usadas em
projetos reais continuam necessárias antes do lançamento.

```bash
# Plano gratuito: mostra cada request, modelo e custo máximo previsto.
node scripts/blocos3d-harness/run.mjs --max-usd=60

# Executa apenas com chave e teto explícitos; grave o diretório para retomar.
FAL_KEY=... node scripts/blocos3d-harness/run.mjs --execute --max-usd=60 --out=/caminho/run-01

# Comparação do mesmo H3.1 via fal e Tripo direto, incluindo os demais motores.
# Conjunto ABO: 12 objetos, quatro conjuntos multiview, 48 tarefas;
# custo máximo previsto de US$21,30, conferido no plano sem --execute.
FAL_KEY=... TRIPO_API_KEY=... node scripts/blocos3d-harness/run.mjs \
  --models=h31,h31_direct,hunyuan,rodin --execute --max-usd=60 --out=/caminho/run-02

# Preencha scores.csv com notas inteiras de 1 a 5 e gere a comparação.
node scripts/blocos3d-harness/review.mjs /caminho/run-01
node scripts/blocos3d-harness/report.mjs /caminho/run-01
```

O runner grava o ID após cada submissão. Repetir com o mesmo `--out`
retoma pedidos com ID conhecido sem criar outra geração. Se cair no instante
da submissão, bloqueia o pedido como `submitting`: confira o painel do provider
e reconcilie manualmente antes de tentar novamente. O teto considera também
pedidos anteriores no mesmo `--out`. Um resultado completo fica
em GLB com contagem de triângulos, texturas, bytes, tempo, custo previsto,
dimensões e inspeção de materiais. Fotos de referência e prévias ficam no
diretório da execução. Abra `review.html` para comparar visualmente a frente
de cada resultado. Confira o GLB em várias vistas e importe-o no software de
projeto: a prévia do provider não prova fidelidade dos lados ou escala.
Não faz retries pagos. O teto é conferido pelo custo previsto de **todo** o
plano antes da primeira submissão. Confira as tarifas nos dois providers antes
de executar. `h31_direct` usa somente `TRIPO_API_KEY` e pode rodar isolado com
`--models=h31_direct`; o upload é feito para a Tripo e WebP é convertido a PNG.
Os dois caminhos usam PBR, textura detalhada, geometria standard, alinhamento
com a foto e auto size; a API direta fixa o snapshot `v3.1-20260211`.
O relatório usa os créditos efetivamente consumidos na API direta quando
disponíveis (100 créditos = US$1). Para fal, usa a tarifa prevista até conciliar
os eventos faturados da conta; não trate a comparação de preço como conclusiva
sem essa conciliação.
O H3.1 usa os mesmos parâmetros da produção, incluindo alinhamento da textura
à imagem original. Para novas fotos públicas, registre autor, origem e licença
junto do diretório.

Avalie cada GLB visualmente e na ferramenta de cena. Em `scores.csv`, anote
fidelidade à foto (peso 40%), materiais/PBR (25%), geometria/topologia (20%)
e uso em cena/importação (15%). O relatório calcula média e nodes estimados
para 75% e 80% no piso legado. Notas em branco não entram no ranking; sem
10 objetos avaliados por motor e quatro com quatro vistas, o relatório marca
o benchmark inconclusivo. Compare também falhas e tempo; a pontuação isolada
não autoriza uma troca de motor.
