# Editar econômico — preparação de integração (26/10/2026)

Esta implementação prepara um piloto interno. Não constitui liberação de produção nem validação de precisão dos modelos. Nenhuma chamada de inferência paga ou alteração de banco remoto foi executada nesta etapa.

## Comportamento preparado

- O servidor habilita a rota econômica apenas com `EDIT_V4_ECONOMIC=1` **e** UUID do usuário em `EDIT_V4_ECONOMIC_USERS` (lista separada por vírgulas). A lista vem da configuração do servidor, nunca do cliente. O restante da base continua na rota existente.
- A cotação e a tela exibem 10 Nodes para o grupo interno. `dry_run=true` não busca imagens, não cria jobs e não chama provedores. O teto aritmético é comparado com metade da geração Quasar 2K do catálogo; equivalência de qualidade/resolução ainda precisa ser validada.
- `EDIT_V4_ECONOMIC_PAID_CALLS` nasce desligado. Mesmo que a rota econômica esteja habilitada, o POST real retorna indisponibilidade sem acessar banco, Storage ou provedores. A preparação de 26/10 não alterou variáveis remotas; a configuração de 27/10 é restrita à prévia descrita abaixo.
- `EDIT_V4_PAID_CALLS=0` pausa também os motores legados, antes de criar cliente administrativo, normalizar o pedido ou iniciar edição. Ausente conserva o comportamento legado. A cotação e todos os pontos de entrada do editor recebem a mesma disponibilidade calculada no servidor; na pausa a revisão permite conferir preço e pedido, e confirma localmente antes de enviar máscara/imagem. Não altera os ajustes gratuitos nem autoriza inferência.
- O piloto exige texto original, máscara completa confirmada, UUID do pedido e uploads do próprio usuário. Não amplia a máscara automaticamente. Imports de CDN e imagens pertencentes a outros membros precisam de um resolvedor de autorização antes de ampliar o escopo.
- Leitura visual Luna recebe origem, máscara, detalhe correspondente, pedido original e referência opcional. Todas as decisões são vinculadas por hashes de pixels da origem, máscara e pedido. Seleção incompleta, alvo ambíguo ou sobreposição de protegidos interrompe o fluxo.
- Trocas simples no mesmo material/acabamento podem usar as quatro cores predefinidas (azul-marinho, sálvia, oliva, floresta). A aplicação usa exclusivamente pixels originais, máscara e cor fixa. Não aceita imagem/paleta Flash. Preto metálico, novas texturas e referências vão ao Flash.
- Flash usa diretamente ModelArk, modelo `dola-seedream-5-0-flash-260915`, um candidato 1K, imagem de contexto limpa, coordenadas locais do alvo e instruções de preservação. Nenhum fallback fal.ai, repetição automática, corrida de modelos ou troca para Pro. O Pro permanece na rota legada; preço/seleção avançados próprios não são liberados neste piloto.
- O resultado é recomposto na resolução da origem. Fora da máscara: RGB idêntico à origem normalizada. Remoção/refino usam correção de contorno por Poisson; as outras ações recebem composição estrita. Não há expansão automática para corrigir uma máscara incompleta. A preservação de juntas/geometria dentro da máscara continua dependendo de avaliação visual.
- Saída PNG sem perda, até 14 MiB. Não há fallback silencioso para JPEG ou redução de resolução. Origem até 20 MP; origem com transparência real ainda não suportada. Essas limitações são verificadas antes da edição paga.
- Avaliador Luna confere **o PNG final**, quadro completo e detalhes, contra o pedido original. Exige alvo, pedido, geometria, protegidos, artefatos, referência e evidências. Campos ausentes, resposta truncada, recusa, hashes diferentes, incerteza ou indisponibilidade impedem entrega e cobrança. Não há segunda geração após reprovação da cor local.
- A verificação do V4 legado também passa a bloquear com ou sem máscara. Desligar o avaliador ou perder a dependência Gemini não significa aprovação. Essa mudança pode aumentar rejeições se o serviço estiver indisponível; precisa ser verificada no ambiente de testes antes de merge.

## Custos e margem

A nova rota econômica possui política separada da precificação antiga do Pro. Usa Starter legado R$89/750 Nodes, câmbio de planejamento R$6/US$ e encargos variáveis de 8%, mantidos como premissas congeladas. Office não entra nessa política.

- Receita de 10 Nodes: US$0,19777778.
- Meta: 73,89% após custos variáveis. Orçamento de processamento por útil: US$0,03581756.
- Aproveitamento de planejamento: 90% (hipótese, não medição nova). Teto por tentativa: US$0,03223580.
- Reservas por etapa: leitor US$0,004; Flash US$0,018 quando usado; avaliador US$0,004. Infra estimada US$0,00133333 e reserva adicional US$0,00345958 permanecem.
- Cada reserva é gravada **antes** da chamada paga. Falha sem custo confirmado mantém a reserva. Uso sem dados completos de tokens interrompe o fluxo. Custo acima do teto impede novas etapas e entrega, sem aumentar o preço ao usuário.
- Tokens de entrada e saída completos da OpenAI (incluindo raciocínio em output_tokens) são reprecificados a US$0,10/US$0,50 por milhão, sem descontar cache. São estimativas pelo uso, não faturas conciliadas. Tarifa Flash: US$0,018/saída. Chamadas também entram no observador de custos existente, inclusive falhas; reservas e detalhes por etapa ficam na tabela privada do pedido.
- Custos de falhas/descarte não somem quando o usuário não é cobrado. A margem deve ser apurada por coorte dividindo todas as tentativas pelo número de entregas úteis confirmadas por humano.

Os 81,04% e 79,67% anteriores continuam sendo projeções do replay, não margens demonstradas por este código. Não foi assumido desconto de tokens ou economia em dólares pelo novo compositor. Custo humano, processamento recorrente e frequência real da cor local ainda precisam ser medidos.

## Idempotência e cobrança

A migração `20261026121901_edit_v4_economic_guardrails.sql` é aditiva e foi testada em Postgres local (PGlite), sem aplicação remota. Usa as tabelas/funções atuais de histórico e carteira do workspace; cria apenas o registro privado do pedido e duas RPCs de controle.

- Repetir o mesmo UUID retorna o resultado concluído ou o estado em andamento. Alterar o conteúdo sob o mesmo UUID é recusado.
- O browser conserva UUID e payload exatos após perda de resposta, incluindo as URLs originalmente enviadas. Nova intenção ou tentativa explicitamente encerrada recebe novo UUID.
- Um pedido sem persistência durável não inicia IA. Uma tentativa antiga sem conclusão não é regenerada automaticamente; exige reconciliação.
- Débito de 10 Nodes, atualização de uso mensal e conclusão do histórico ocorrem na mesma transação SQL. Falha em qualquer gravação reverte tudo. Repetir a conclusão não debita novamente.
- Resposta de conclusão perdida é tratada como pendente; o servidor não marca o pedido como falho nem cobra outra vez sem reconciliar.
- Reprovação não retorna a imagem e não debita. Chamada paga já efetuada continua registrada no custo.
- Tabela de pedidos com RLS; sem leitura/escrita por `anon`/`authenticated`. RPCs `security invoker`, somente `service_role`; nenhum segredo é enviado ao browser. Testes locais verificam essas permissões.

## Verificação sem chamadas pagas

```sh
npm ci --ignore-scripts
npx next typegen
npm run typecheck
npm test -- tests/editar
npx eslint lib/edit-v4/economic lib/edit-v4/client-request.ts lib/edit-v4/semantic-gate.ts tests/editar/economic --quiet
```

Os testes de provedores usam HTTP simulado e bloqueiam fetch real. A suíte rápida usa Postgres em memória; a validação adicional de 27/10 abaixo usa Postgres nativo isolado e as definições reais da carteira. Nenhuma migração ou RPC de cobrança foi executada em projeto remoto.

Regressão opcional nas oito saídas já salvas: definir `EDIT_OFFLINE_REPLAY_ROOT` para a pasta local do projeto que contém `output/editar-flash-v4-2026-10-23`. Esse teste lê somente os arquivos congelados, confirma diferença de no máximo 1 nível sRGB e preservação exata fora da máscara; não mede precisão de IA nova.

## Antes da liberação

1. Revisar os resultados do Postgres isolado descritos abaixo. Antes de produção, ainda conferir o transporte PostgREST e os advisors do ambiente Supabase de destino, com inferência desligada e autorização própria para qualquer aplicação remota. Não copiar segredos de produção para testes.
2. Manter chamadas pagas e cobrança real desligadas na configuração inicial. Cotações e bloqueio de execução podem ser verificados sem credenciais de provedores.
3. Autorizar separadamente uma nova rodada com teto global explícito. O saldo de US$15 da rodada anterior **não** é renovado ou reutilizado aqui. Os interruptores de configuração não substituem essa autorização.
4. Validar leitores/avaliadores Luna e Flash ponta a ponta em pelo menos 24 pedidos de 12 projetos novos, com seleção e resultado de referência humanos. Medir falsa aprovação, falsa rejeição, rejeição técnica, tempo e custo completo por útil. Não tratar as duas repetições determinísticas de cor como testes independentes.
5. Confirmar qualidade/resolução comparável à geração que fundamenta os 10 Nodes. Medir câmbio, taxas, base de Nodes ativos e custos variáveis recorrentes; não transportar as margens do replay como garantia.
6. Manter pilar/reboco e demais casos não aprovados fora do escopo inicial. Precisão e margens de novos pedidos ainda não estão demonstradas. Liberar um grupo pequeno somente após esses critérios, com acompanhamento e reversão pronta.

Rollback do piloto: retirar usuário da lista ou desligar `EDIT_V4_ECONOMIC`. Para suspender chamadas novas imediatamente, `EDIT_V4_ECONOMIC_PAID_CALLS=0`. Não apagar históricos/ledger ou reverter débitos confirmados durante rollback. Retirar o interruptor não cancela uma chamada já enviada; reconciliar os pedidos em andamento.

### Prévia sem inferência (27/10/2026)

Para a branch do PR #327, configurar exclusivamente no alvo Preview: `NEXT_PUBLIC_EDIT_V4=1`, `EDIT_V4_ENABLED=1`, `EDIT_V4_ECONOMIC=1`, `EDIT_V4_ECONOMIC_USERS=<UUID da conta interna>`, `EDIT_V4_ECONOMIC_PAID_CALLS=0`, `EDIT_V4_PAID_CALLS=0`, `EDIT_V4_CHARGE=0`. Nunca atribuir essas configurações de teste ao alvo Production. O próximo build da branch recebe a configuração; deployments anteriores permanecem com sua configuração congelada.

Cotação autenticada: 200, 10 Nodes e `execution_available=false`. Execução autenticada: 503 antes de banco/Storage/IA, inclusive fora da lista econômica. Sem sessão: 401. Não ativar bypass de autenticação na Vercel. Para conferir seleção no navegador sem gravar dados, abrir uma imagem própria já existente em `/app/editar?source=...`, sem salvar projeto, transferir arquivos ou usar ferramentas que façam upload. Um projeto novo não faz autosave antes do primeiro salvamento manual.

### Revisão e banco isolado (27/10/2026)

A migração foi aplicada e reaplicada em PostgreSQL 17.10 nativo, com socket local exclusivo, sem listener TCP, sem chaves de produção e somente usuários/saldos sintéticos. As definições de sete tabelas, dos triggers relevantes e de `consume_workspace_nodes`, `consume_nodes_v2`, `expire_plan_nodes_for_user` e `bump_monthly_usage` vieram de consultas de catálogo somente de leitura. Nenhuma linha de cliente foi copiada. Login/Auth HTTP e transporte PostgREST não fazem parte desse ensaio SQL.

- O schema observado não tinha `edit_v3_jobs.client_request_id`. A migração agora cria a coluna e o índice único de forma aditiva, antes das novas RPCs. Não depende de um pré-requisito que pode nunca ter sido aplicado; dados existentes não são reescritos.
- A conclusão exige que os custos coincidam com o ledger persistido e que a prova corresponda ao pedido reservado, à imagem, à máscara e ao parecer do avaliador. Ausência de comprovação de preservação externa, hashes divergentes e booleanos serializados como texto são recusados antes do débito.
- A tabela privada revoga também os privilégios herdados de `service_role` antes de conceder apenas SELECT/INSERT/UPDATE; permissões padrão não deixam DELETE/TRUNCATE por acidente.
- Exceção de transporte depois de enviar a conclusão fica pendente de reconciliação com o mesmo UUID. Não marca falha terminal nem tenta gerar/cobrar novamente. A regressão reproduziu o comportamento anterior e passou após a correção.
- A criação do índice único também passa a valer para o Pro legado. Pedidos legados encerrados e marcados como não cobrados não são reinseridos com o mesmo UUID; a resposta terminal permite que o cliente encerre aquela tentativa. Histórico com débito confirmado ou incerto exige reconciliação e não convida nova geração.
- 28 cenários nativos passaram: carteira individual e do workspace, mensais + extras, falta de saldo, expiração, rejeição, custos/provas inválidos, rollback por falha no histórico/uso mensal, concorrência entre conexões distintas, cobrança única, permissões, RLS e reaplicação sem perda de dados.
- 208 testes rápidos do módulo Editar passaram, com um replay opcional ignorado; TypeScript e lint dos arquivos alterados passaram.
- Quatro regras SQL oficiais do Supabase/Splinter foram executadas no cluster isolado para os novos objetos: nenhum erro/aviso inesperado. O INFO de RLS sem política na tabela de custos é intencional: clientes não têm acesso e o servidor opera por service-role. Não criar uma política de cliente apenas para suprimir esse INFO.

Os testes financeiros usam as funções reais em dados fictícios, sem provedores de IA. O cluster é encerrado e removido ao final. Essa validação não demonstra precisão dos modelos nem margem de produção. O avaliador do caminho Pro legado continua exigindo validação de disponibilidade antes de liberar o PR.

## Referências consultadas em 26/10/2026

- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/guides/images-vision
- https://docs.byteplus.com/en/docs/modelark/image-generation-api
- https://docs.byteplus.com/id/docs/modelark/model-pricing?redirect=1
- https://supabase.com/docs/reference/javascript/rpc
- https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes

## Evidência da integração local de 26/10/2026

- 193 testes do módulo Editar passaram; o replay opcional fica ignorado na execução padrão e foi executado separadamente com os arquivos locais.
- O replay de oito saídas de quatro tarefas resultou em RGB idêntico às imagens congeladas, inclusive dentro da seleção. Isso verifica o porte da operação de cor, não precisão de IA em casos novos.
- TypeScript e lint dos arquivos alterados passaram.
- Build completo com Webpack passou usando valores públicos fictícios de Supabase, sem credenciais reais de provedores. O build Turbopack local foi interrompido após ficar sem progresso; o caminho Webpack forneceu a verificação de compilação completa.
- Servidor Next local: cotação econômica 200/10 Nodes/execução indisponível; tentativa de editar 503 sem iniciar IA; sem autenticação 401; usuário fora da lista permanece na cotação legada.
- Testes SQL locais comprovaram idempotência, bloqueio de custo/avaliação incompletos, reversão do débito quando o histórico falha, ausência de cobrança em reprovação e permissões privadas. A carteira/uso mensal usaram implementações de teste; a confirmação com as RPCs reais fica para o banco isolado.
- Nenhum deploy, merge, alteração remota de configuração/banco, débito real ou nova inferência paga.
