# Validação do Ampliar — 01/10/2026

Continuação da PR #256, sem merge ou alteração do banco remoto.

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

## Pendências antes da ativação

Aplicar `20261001170000_upscale_pending_nodes.sql` no ambiente escolhido e executar o smoke autenticado com upload direto, FAL, saldo, histórico e download. A aplicação no desenvolvimento foi rejeitada pela revisão automática de permissões por alterar a regra de cobrança; esta continuação usou um banco local descartável.

Não houve inferência FAL nem débito real nesta validação. O teste de UI não comprova qualidade do provider, RLS, consumo real de nodes ou capacidade de memória de um celular físico. O processamento continua síncrono: o registro recupera a resposta, mas não retoma uma execução encerrada abruptamente pela plataforma.
