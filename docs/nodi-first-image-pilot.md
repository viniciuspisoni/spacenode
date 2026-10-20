# Nodi: piloto da primeira imagem

O piloto compara Grok 4.7 e Gemini 2.5 Flash para preparar uma referência própria em Renderizar. Ambos usam a mesma ferramenta de sugestão e o mesmo fluxo de revisão. Gemini é o modelo base do Nodi V2, mas este piloto não reproduz toda a orquestração V2. O Nodi padrão continua com seu fluxo atual.

## Operação

- Exige `NODI_FIRST_IMAGE_PILOT_ENABLED=1`, `NODI_ENABLED=1`, `NODI_V2_ENABLED=1` e `NODI_MULTIMODAL_ENABLED=1`, além de acesso interno decidido no servidor por `isInternalStaff`. Fechado por padrão. Não é um rollout para clientes.
- AI SDK 7.0.145 usa o AI Gateway com OIDC do deployment Vercel. Não exige chave no navegador. A conta Gateway precisa estar habilitada e ter saldo/limite disponível; não há compra automática de créditos nem fallback silencioso entre braços.
- IDs verificados no catálogo completo `https://ai-gateway.vercel.sh/v1/models` em 19/10/2026: `spacexai/grok-4.7` e `google/gemini-2.5-flash`. Confirme no catálogo antes de trocar modelos.
- Cada conta interna pode enviar 3 análises/minuto, 20/dia e 200/janela de 30 dias. O contador usa o RPC existente `bump_rate_limit` e recusa a análise se não conseguir conferir o limite. São tetos de requisições, não um orçamento monetário global.
- Cada análise tem até 2 etapas, 1.200 tokens de saída por etapa, sem retries e prazo de 35 segundos. Cancelar a janela interrompe a espera; o fornecedor ainda pode cobrar trabalho já iniciado.

## Referência → revisão → geração

O usuário confirma origem, tipo de projeto e objetivo. O contexto é travado no primeiro envio; Recomeçar comparação cria outro caso. As conversas são separadas e a primeira pergunta é copiada ao abrir o outro braço, para facilitar um caso pareado.

A imagem é enviada só por ação explícita, pelo upload privado já existente (JPG/PNG/WebP estático, até 8 MB, 40 milhões de pixels). A API verifica dono, validade do anexo, bucket privado, tamanho e decodificação. O modelo recebe uma derivada JPEG de até 1.600 px, sem metadados. Renderizar mantém o arquivo original para a geração. Não há busca de URLs fornecidas pelo navegador.

A única ferramenta do modelo, `preparar_configuracao`, devolve valores do catálogo. Não pode gerar, debitar Nodes, recortar, navegar, acessar terminal ou gravar memória. Um render já pronto recebe orientação para Editar. Solicitações de material exigem superfície válida e descrição. A revisão é editável e só Aplicar altera os controles; Gerar render permanece separado e mostra o custo. Descrições e amostras das demais superfícies são preservadas.

## Medição e limites da evidência

`nodi_events` registra somente identificadores e escalares. Não registra conversa, imagem, configuração textual ou recibo. Não há nova tabela/migration.

| Estágio | Evento existente | Interpretação |
| --- | --- | --- |
| `answered` | `v2_chat` | resposta, proposta disponível, tokens, duração e custo nominal estimado |
| `failed` | `v2_fallback` | falha da referência/modelo, código de diagnóstico limitado |
| `feedback` | `answer_feedback` | a orientação ajudou a preparar? Não mede utilidade do render |
| `applied` | `v2_action_confirmed` | aplicação informada pelo navegador após revisão |
| `generated` | `v2_action_confirmed` | render concluído verificado no servidor e pertencente à conta |

Filtre `meta.source='first-image-pilot'` e `meta.experiment='2026-10-19-v1'`. Compare `meta.provider` (`grok`/`control`) por `case_id`; deduplique respostas por `request_id` e observações por `(request_id,stage,render_id)`. O recibo assinado vincula conta, caso, resposta, braço e marca QA, com validade de 1 hora. A rota pública de telemetria não pode preencher os identificadores do experimento.

`qa=true` é o padrão e deve ficar excluído de métricas de usuários reais. `config_changed=true` distingue revisão/ajustes posteriores da proposta original. A atribuição cobre a primeira geração da referência na mesma sessão preparada: troca, recorte, desfazer recorte e novo render a limpam; reload/rascunho retomado ou recibo vencido deixam a atribuição desconhecida. Observações são best effort; ausência não prova abandono.

Para utilidade, una o `render_id` verificado ao `render_feedback.render_id` e leia **`useful` explícito**. Conclusão técnica, download, avaliação da conversa e silêncio não significam resultado útil. A geração real de QA, se realizada, continua custando Nodes; os testes automatizados e de interface usam serviços simulados.

`cost_estimate_usd` usa tokens medidos com taxas nominais de 19/10/2026 (Grok: US$2/M entrada, US$6/M saída; Gemini: US$0,30/M entrada, US$2,50/M saída). Não inclui descontos/cache, ajustes do provedor ou custo de chamadas que falharam sem uso retornado. Confira cobranças reais na observabilidade Gateway. Não são custos totais faturados.

Antes de expansão, avalie ao menos 20 casos pareados, alternando qual braço vem primeiro: interior/exterior, modelo/foto, objetivo desconhecido, luz válida, material incompleto, material específico, render pronto, imagem pequena, texto malicioso na referência e falha do provedor. Registre acerto do caminho, necessidade de correção, tempo, custo e utilidade explícita. Testes internos não comprovam aumento de conversão; isso exige uma etapa de medição com usuários reais autorizados.

## Alternativa Hermes na VPS

Hermes Agent é uma camada de execução e memória; Grok é uma opção de modelo. A mesma revisão pode receber propostas de um backend Hermes no futuro. Esta mudança não instala Hermes nem altera a VPS. Antes dessa troca, definir instância dedicada, ferramentas limitadas à sugestão, autenticação entre servidores e isolamento por usuário/sessão; não expor o conjunto padrão com terminal e ferramentas gerais a clientes.

Referências oficiais: [provedores Hermes](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/integrations/providers.md), [API server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server), [Gateway](https://vercel.com/docs/ai-gateway).
