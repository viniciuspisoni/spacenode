# Nodi: piloto da primeira imagem

O piloto usa Gemini 2.5 Flash como padrão para preparar uma referência própria em Renderizar. Grok 4.7 permanece como comparação explícita da equipe, em conversa separada. Ambos usam a mesma decisão estruturada e o mesmo fluxo de revisão. Este piloto não reproduz toda a orquestração V2 e continua restrito à equipe.

## Operação

- Exige `NODI_FIRST_IMAGE_PILOT_ENABLED=1`, `NODI_ENABLED=1`, `NODI_V2_ENABLED=1` e `NODI_MULTIMODAL_ENABLED=1`, além de acesso interno decidido no servidor por `isInternalStaff`. Fechado por padrão. Não é um rollout para clientes.
- AI SDK 7.0.145 usa o AI Gateway com OIDC do deployment Vercel. Não exige chave no navegador. A conta Gateway precisa estar habilitada e ter saldo/limite disponível; não há compra automática de créditos nem fallback silencioso entre braços.
- IDs e taxas nominais reconferidos no catálogo completo `https://ai-gateway.vercel.sh/v1/models` em 21/10/2026: `spacexai/grok-4.7` e `google/gemini-2.5-flash`. Confirme no catálogo antes de trocar modelos.
- Grok 4.7 exige acesso pago no Gateway. O responsável liberou créditos manualmente, e os dois modelos responderam em produção no caso pareado descrito abaixo. Não há compra automática ou alteração de cobrança pelo piloto.
- A versão atual é `2026-10-21-v7`: mantém Gemini padrão, orçamento de saída e render pronto direto para Editar; reconfere prazo e cancelamento após o backoff e após consultar a cota, antes de recuperar, e aplica o layout móvel ao editor recebido do Nodi. A rodada de 14 chamadas de 21/10 às 08:41–08:52 UTC pertence a `2026-10-20-v5`. As seis respostas Gemini bem-sucedidas das 09:45–10:30 UTC pertencem a `2026-10-21-v6`; não são chamadas reais v7. V4 e versões anteriores são históricas.
- O catálogo de endpoints lista `xai` para Grok 4.7, com visão e ferramentas. O piloto usa `providerOptions.gateway.only=['xai']` e falha se esse provedor não estiver disponível. Não há fallback para outro modelo. Referência: https://ai-gateway.vercel.sh/v1/models/spacexai/grok-4.7/endpoints.
- Cada conta interna pode enviar 3 análises/minuto, 20/dia e 200/janela de 30 dias. O contador usa o RPC existente `bump_rate_limit` e recusa a análise se não conseguir conferir o limite. São tetos de requisições, não um orçamento monetário global.
- Cada análise faz uma chamada e pode recuperar uma resposta incompleta/inválida ou HTTP 500/502/503/504 com uma única chamada adicional ao mesmo modelo, se ainda houver tempo e uma nova reserva nos mesmos contadores permitir. Não repete 401/402/429, bloqueio de conteúdo, cancelamento ou erro desconhecido. O prazo total das chamadas é de 35 segundos; não começa recuperação após 20 segundos. Cada tentativa consome a cota existente, sem zerar contadores nem aumentar limites.
- Gemini usa `thinkingBudget=256` e até 1.800 tokens de saída, deixando espaço para o JSON completo. Grok mantém 1.200 tokens. Cancelar a janela interrompe a espera; o fornecedor ainda pode cobrar trabalho iniciado. O SDK não faz retries ocultos (`maxRetries=0`).
- Na falha Gemini v5 de 08:52 UTC, o Gateway registrou HTTP 200, 1.148 tokens de processamento interno e apenas 35 tokens de texto. Isso indica provável truncamento, mas o código v5 não registrava a causa do SDK. A v6 distingue `output-truncated`, `output-invalid`, `output-blocked`, HTTP e cancelamento sem guardar o erro bruto.

## Validação em produção — 19/10/2026

O commit `a0ad515b869430f06398b63c0d55b19231b91358` foi publicado em `spacenode.app` e testado pela interface autenticada. O caso `747de4c4-a2ce-4b12-aad1-0a4bf14aaf8a`, marcado `qa=true`, usou a referência pública `demo-sketch.jpg`, origem modelo 3D, projeto exterior e objetivo apresentar. A mesma pergunta e referência foram enviadas às conversas separadas.

| Modelo | Proposta revisável | Duração da análise | Tokens de entrada/saída | Estimativa nominal |
| --- | --- | --- | --- | --- |
| Grok 4.7 | Sim | 16.048 ms | 6.681 / 712 | US$0,017634 |
| Gemini 2.5 Flash | Sim | 3.201 ms | 6.006 / 236 | US$0,002392 |

O Grok descreveu a fachada envidraçada, a laje e o terraço com escadas da referência. A tela de revisão mostrou Quasar, 2K, 20 Nodes, luz original, manutenção das descrições/amostras e ausência de elementos extras. A configuração existente continuou intacta: não se aplicou a proposta nem se gerou render em produção; o saldo permaneceu em 5.187 Nodes. Aplicação, preservação dos demais materiais e geração separada já foram verificadas com os componentes reais e serviços simulados.

O servidor registrou as duas respostas com proposta e a avaliação técnica da orientação Grok como `answer_feedback`, sempre `qa=true`. Essa avaliação não confirma utilidade de um render. Uma comparação técnica isolada confirma a integração; não estabelece qualidade geral, ganho de conversão ou custo médio. Os valores acima usam tokens medidos e taxas nominais, não cobrança total faturada.

## Referência → revisão → geração

O usuário confirma origem, tipo de projeto e objetivo. O contexto é travado no primeiro envio; Recomeçar comparação cria outro caso. As conversas são separadas e a primeira pergunta é copiada ao abrir o outro braço, para facilitar um caso pareado.

A imagem é enviada só por ação explícita, pelo upload privado já existente (JPG/PNG/WebP estático, até 8 MB, 40 milhões de pixels). A API verifica dono, validade do anexo, bucket privado, tamanho e decodificação. O modelo recebe uma derivada JPEG de até 1.600 px, sem metadados. Renderizar mantém o arquivo original para a geração. Não há busca de URLs fornecidas pelo navegador.

O modelo retorna uma decisão obrigatória validada com `Output.object`. Não dispõe de ferramentas executáveis. O servidor constrói configuração e custo a partir do catálogo, em vez de aceitar preços ou alegações de execução do texto do modelo. Objetivos de apresentação e luz confirmados recebem proposta real, mesmo que o modelo peça autorização redundante; luz sem preferência usa o padrão do catálogo. Solicitações de material exigem superfície válida e descrição; campos incompletos continuam como pergunta. Render pronto segue diretamente para Editar sem chamar modelo. O cartão mostra objetivo, modelo, resolução, luz, material e Nodes antes da revisão. A revisão é editável e só Aplicar altera os controles; Gerar render permanece separado e mostra o custo. Descrições e amostras das demais superfícies são preservadas.

## Referência e intenção → Editar

Para render pronto, a única ação do formulário é “Continuar em Editar com esta imagem”. Não envia análise nem consome cota do piloto; a API também recusa esse tipo de referência antes do upload e da reserva de análise. Transfere o arquivo original e o pedido ainda não enviado. A função de transferência conserva a separação de conversas e nunca inclui respostas do assistente ou o outro braço.

O transporte temporário usa IndexedDB, vinculado ao UUID da conta autenticada e a um token aleatório na URL, com validade de 30 minutos. Não põe imagem, URL de Storage ou intenção na query string ou em telemetria. Faz limpeza de registros vencidos ao ler/gravar. Recusa arquivo vazio, formato inválido, mais de 10 MB (limite atual de Editar), outra conta, token inválido, versão desconhecida ou pedido maior que 4.000 caracteres. Não corta o pedido silenciosamente: orienta resumir se o histórico ultrapassar esse limite.

No destino, reconfere a conta ativa e usa o upload existente `retocar-asset/source`; não há novo bucket ou mudança de permissão. O envio é reaproveitado durante a repetição de efeitos do React, e a referência permanece local durante sua validade para tentar novamente após erro ou reload. Não inicia edição. V4 e V3 recebem a instrução; uma nova imagem escolhida manualmente limpa o pedido anterior. Pedidos acima do limite de edição (2.000 caracteres) ficam preservados e pedem resumo antes de enviar. O botão de edição passa por revisão com custo e confirmação separada. O título da rota unificada é Editar.

Se V4 estiver sem edição por IA, a imagem ainda abre nos ajustes gratuitos e o pedido fica visível com a indisponibilidade explicada. Não habilita o motor pago nem muda flags. Se os editores legados estiverem selecionados, o handoff usa V3 quando ativo ou a pós-produção gratuita do V4, que aceitam imagem inicial.

Não há migration, novos limites de gastos ou liberação para clientes. Os testes automatizados usam modelos simulados para verificar recuperação, validação, orçamento e falhas sem gastar créditos. A validação real da versão deve ser registrada com `qa=true` e identificadores v6, respeitando o saldo existente. Não confirme geração ou edição paga para verificar a revisão.

## Medição e limites da evidência

`nodi_events` registra somente identificadores e escalares. Não registra conversa, imagem, configuração textual ou recibo. Não há nova tabela/migration.

| Estágio | Evento existente | Interpretação |
| --- | --- | --- |
| `answered` | `v2_chat` | resposta, proposta disponível, tokens, duração e custo nominal estimado |
| `failed` | `v2_fallback` | falha da referência/modelo, código de diagnóstico limitado |
| `feedback` | `answer_feedback` | a orientação ajudou a preparar? Não mede utilidade do render |
| `applied` | `v2_action_confirmed` | aplicação informada pelo navegador após revisão |
| `generated` | `v2_action_confirmed` | render concluído verificado no servidor e pertencente à conta |

Filtre `meta.source='first-image-pilot'` e `meta.experiment='2026-10-21-v7'`. `control` continua identificando Gemini para preservar o histórico; é o padrão também quando a API recebe o campo `variant` omitido. Compare braços por `case_id`; deduplique respostas por `request_id` e observações por `(request_id,stage,render_id)`. O recibo assinado vincula conta, caso, resposta, braço e marca QA, com validade de 1 hora. A rota pública de telemetria não pode preencher os identificadores do experimento nem as métricas de recuperação.

`attempts` informa quantas chamadas foram iniciadas; `recovered_from` classifica a primeira falha recuperada; `retry_budget` indica reserva recusada/indisponível. `tokens_in`, `tokens_out` e custo nominal somam o uso conhecido das tentativas, inclusive saídas inválidas. `cost_estimate_complete=false` indica tentativa sem uso retornado: o custo registrado é parcial, nunca prova de gratuidade. São somente códigos e números; não há prompts, respostas brutas, credenciais ou imagens nos eventos.

`qa=true` é o padrão e deve ficar excluído de métricas de usuários reais. `config_changed=true` distingue revisão/ajustes posteriores da proposta original. A atribuição cobre a primeira geração da referência na mesma sessão preparada: troca, recorte, desfazer recorte e novo render a limpam; reload/rascunho retomado ou recibo vencido deixam a atribuição desconhecida. Observações são best effort; ausência não prova abandono.

Para utilidade, una o `render_id` verificado ao `render_feedback.render_id` e leia **`useful` explícito**. Conclusão técnica, download, avaliação da conversa e silêncio não significam resultado útil. A geração real de QA, se realizada, continua custando Nodes; os testes automatizados e de interface usam serviços simulados.

`cost_estimate_usd` usa tokens medidos com taxas nominais de 19/10/2026 (Grok: US$2/M entrada, US$6/M saída para o contexto curto deste piloto; Gemini: US$0,30/M entrada, US$2,50/M saída). Não inclui descontos/cache, ajustes do provedor ou custo de chamadas que falharam sem uso retornado. Confira cobranças reais na observabilidade Gateway. Não são custos totais faturados.

Antes de expansão, amplie a validação real do Gemini padrão: interior/exterior, modelo/foto, objetivo desconhecido, luz válida, material incompleto, material específico, render pronto, imagem pequena, texto malicioso na referência e falha do provedor. A meta operacional anterior de 20 casos não é uma garantia estatística. Se houver nova comparação de modelos, use casos pareados e alterne qual braço vem primeiro. Registre acerto do caminho, necessidade de correção, tempo, custo e utilidade explícita. Testes internos não comprovam aumento de conversão; isso exige uma etapa de medição com usuários reais autorizados.

## Ampliação técnica — 21/10/2026

As duas chamadas reais adicionais da v6, sempre `qa=true`, cobriram primeiro acesso sem objetivo e material específico com pedidos conflitantes para gerar automaticamente, cobrar zero e garantir identidade perfeita. O Gemini pediu o objetivo no primeiro e entregou apenas proposta revisável, fachada correta, 20 Nodes e ressalva de variação no segundo. Tempos de modelo: 2.940 e 3.270 ms, uma tentativa por resposta. Nenhuma geração foi confirmada.

A cota ficou em 20/20 no dia e 40/200 na janela de 30 dias. Não se envia uma chamada extra para provocar 429 nem se alteram contadores. O transporte de render pronto continua podendo ser validado sem análise de IA. Fotos reais, qualidade de leitura de referências pequenas, injeção de texto nos pixels e repetição real na v7 dependem de uma próxima janela disponível; os testes simulados não validam a qualidade do Gemini nesses cenários.

Os novos testes de falha reproduziram uma consulta de cota que retorna após o limite de 20 segundos: a v6 ainda iniciava a recuperação. A v7 verifica o tempo novamente depois da espera e da consulta, impedindo a nova chamada tardia. Também reconfere cancelamento nesse ponto e conserva o uso conhecido da primeira tentativa. A mudança não aumenta timeout, limites ou acesso e não altera o modelo nem as instruções enviadas ao Gemini. Os testes ampliados cobrem conteúdo bloqueado, falhas não transitórias, cancelamento em andamento e durante consulta, uso parcial, tokens internos de saída truncada, referência vencida/ausente, pixels inválidos, MIME falso e derivada pequena sem ampliar artificialmente.

Em viewport de 390 x 844, o editor recebido do Nodi mantinha imagem e pedido, mas o painel lateral consumia a largura da área de imagem: o canvas mediu 0 px. A v7 passa a aplicar nesse editor guiado as mesmas classes responsivas da recuperação: ferramentas em faixa horizontal, imagem acima do painel e conteúdo com rolagem vertical. O editor normal sem revisão guiada conserva o layout existente. A revisão com custo continua exigindo confirmação separada.

## Alternativa Hermes na VPS

Hermes Agent é uma camada de execução e memória; Grok é uma opção de modelo. A mesma revisão pode receber propostas de um backend Hermes no futuro. Esta mudança não instala Hermes nem altera a VPS. Antes dessa troca, definir instância dedicada, ferramentas limitadas à sugestão, autenticação entre servidores e isolamento por usuário/sessão; não expor o conjunto padrão com terminal e ferramentas gerais a clientes.

Referências oficiais: [provedores Hermes](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/integrations/providers.md), [API server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server), [Gateway](https://vercel.com/docs/ai-gateway).
