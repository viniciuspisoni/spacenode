# Validação do Ampliar — 01/10/2026

Continuação da PR #256, com migração aplicada e verificada somente no banco `spacenode-dev`. A PR permanece em rascunho, sem merge.

## Correções finais

- O fundo da ferramenta usa a prévia; o PNG completo só é solicitado no detalhe 100% e no download quando as prévias estão disponíveis.
- A recuperação tolera o intervalo entre o recebimento do POST e o registro da geração, consultando por GET por até 10 segundos antes de considerar um 404 definitivo.
- “Voltar ao automático” reaplica a recomendação da imagem atual.
- O carregamento por `?source=` aceita o proxy privado `/api/media`.
- A rolagem no celular permite acessar todos os controles, a comparação e as ações finais. O palco também permite rolagem quando o detalhe excede sua altura.

## Evidências locais

- 739 testes passaram; 5 foram pulados. Os novos casos verificam recuperação antes do registro e encerramento da espera por um ID inexistente.
- Build, typecheck e lint dos arquivos desta continuação passaram. O build local usou placeholders públicos de Supabase, sem acesso ao serviço.
- A migração foi executada em Postgres descartável via PGlite. Passaram 26 casos, incluindo os dois nomes de constraint legados, reaplicação, dados existentes, testes internos, valores negativos e zero em outros módulos. A expressão vigente da constraint foi consultada no banco de produção por leitura.
- A interface real foi exercitada em Chromium, com viewports 1440×900 e 390×844, no mesmo shell de altura fixa usado pelo app. Os serviços externos e as respostas autenticadas foram simulados.
- Escalas 2×/4×, resolução estimada, ajustes, retorno ao automático, prévia e detalhe em 100% passaram. No celular, a rolagem pelo usuário tornou o botão de download acessível sem cortar os controles.
- O PNG de 4800×3200 px tinha 46.156.401 bytes (44,0 MiB). O download preservou exatamente esse tamanho; a URL do master não foi solicitada antes de entrar no detalhe em 100%.
- Recarregar uma geração registrada disparou somente GET, sem repetir o POST. O PNG de 44 MiB também foi reutilizado como entrada pelo proxy privado no teste desktop.
- Não houve erro de console ou overlay de erro nesses fluxos. A rota e as imagens temporárias de QA foram removidas da entrega.

## Validação no banco de desenvolvimento

- Projeto confirmado antes da aplicação: `spacenode-dev` (`aehmbapbbrefglsrkrgs`). O arquivo `20261001170000_upscale_pending_nodes.sql` foi aplicado com o nome `upscale_pending_nodes`; o histórico remoto registrou a versão `20261001202804`.
- A constraint `renders_nodes_charged_check` está validada (`convalidated = true`). A expressão anterior `nodes_charged > 0` foi preservada; a exceção permite zero apenas quando `ambient = 'upscale'` e `status` é `pending` ou `failed`.
- A expressão registrada no catálogo foi avaliada por SELECT no próprio Postgres em 96 combinações de módulo, status e cobrança, incluindo valores nulos. Resultado: zero divergências, somente dois casos com cobrança zero permitidos e nenhum valor negativo permitido. Essa verificação não inseriu gerações nem alterou saldos.
- A migração não foi aplicada ao banco de produção.

## Pendências antes da ativação

Executar o smoke autenticado em um ambiente confirmado como ligado ao `spacenode-dev`, com upload direto, FAL, saldo, histórico e download. Não há uma sessão autenticada disponível para esse teste nesta validação, e o banco usado pelo preview ainda não foi confirmado como desenvolvimento. Antes da ativação em produção, aplicar `20261001170000_upscale_pending_nodes.sql` também no banco de produção.

Não houve inferência FAL nem débito real nesta validação. O teste de UI não comprova qualidade do provider, RLS, consumo real de nodes ou capacidade de memória de um celular físico. O processamento continua síncrono: o registro recupera a resposta, mas não retoma uma execução encerrada abruptamente pela plataforma.
