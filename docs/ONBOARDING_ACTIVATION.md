# Onboarding interativo — 13/10/2026

## Caminho até primeiro valor

A introdução do primeiro acesso tem duas etapas: escolher o ponto de partida e preparar uma imagem do próprio projeto. O comparador usa o par demonstrativo já existente em `public/demo-sketch.jpg` e `public/demo-render.jpg`; ele é identificado como exemplo, nunca como resultado da pessoa.

| Entrada escolhida | Destino | Próxima ação |
| --- | --- | --- |
| Modelo 3D | `/app/generate?onboarding=model#guia` | Exportar uma vista limpa e escolher a imagem. |
| Render existente | `/app/editar?onboarding=1` | Abrir o render e escolher uma mudança específica. |
| Foto do projeto | `/app/generate?onboarding=photo#guia` | Escolher uma foto nítida do espaço. |

A lista de preparação é opcional. Fechar ou pular permite continuar na plataforma. O item **Como usar** reinicia a introdução pelo dashboard. Um cartão de início permanece no dashboard enquanto não houver resultados concluídos; o tour dispensado não elimina esse caminho.

O guia de Renderizar acompanha o estado real: referência → configuração → geração → comparação. Seus botões abrem o seletor de imagem e o painel de luz. Ele mostra o custo atual em Nodes e nunca dispara uma geração automaticamente. A preferência de dispensar o guia é separada por conta no navegador. O guia do Editar aparece apenas nos links de onboarding e cobre as versões atual e legadas do editor.

### Interações adicionadas em 14/10/2026

- **Explorar com um exemplo:** carrega a referência pública `demo-sketch.jpg` no mesmo painel, sem upload ou geração. Enquanto essa referência está ativa, o CTA pede uma imagem própria e o handler de geração também bloqueia a operação. O exemplo não emite `render_reference_selected`. Um arquivo escolhido durante o carregamento cancela o exemplo; falha ao carregar permite tentar novamente ou enviar o projeto.
- **Objetivo opcional:** apresentar o projeto, explorar a luz ou estudar um material. A escolha registra apenas uma intenção em `cta_clicked`, sem alterar configuração, motor, resolução ou saldo. Cada orientação abre o controle correspondente e leva o foco ao painel, inclusive no celular.
- **Conferir configuração e custo:** uma seção recolhível reflete os valores reais de cena, luz, materiais, motor, resolução e Nodes. Cada linha abre o ajuste correspondente. Não há preset que substitua escolhas anteriores.
- **Comparação orientada:** lista opcional de proporções, materiais/luz e adequação à tarefa. Ela reinicia por resultado, não grava feedback e não libera oferta. A pergunta, as opções, o momento e a elegibilidade de `RenderFeedback` permanecem iguais.
- **Reabrir e trocar:** o guia pode ser reaberto na própria tela. O seletor de arquivo permanece montado; trocar imagem abre diretamente o seletor e cancelar mantém a referência atual. Limpar o valor do input permite selecionar novamente o mesmo arquivo.

Os vídeos existentes continuam disponíveis. A hipótese desta rodada é reduzir dúvidas antes da primeira geração com um projeto real; uso do exemplo, objetivo escolhido e lista marcada não são evidência de primeiro valor.

`profiles.onboarding_completed_at` continua significando introdução vista ou dispensada. A gravação usa o usuário autenticado, mantém o filtro de propriedade e só emite `onboarding_completed` depois de uma gravação confirmada. Isso não significa primeiro valor.

## Resultado, ajuda e assinatura

A conclusão técnica mantém comparação, download e ações sobre a imagem. A avaliação existente pergunta se o render serviu ao projeto e salva a resposta no endpoint autenticado de `render_feedback`.

- **Sem resposta:** utilidade desconhecida; o convite contextual de assinatura não aparece.
- **Ainda não:** mostra orientação por motivo. Materiais, luz e outros ajustes podem abrir a mesma imagem no Editar. Geometria pede revisão da referência e comparação antes de outra geração.
- **Sim, salvo:** abre os próximos passos. Desde 15/10, o convite do Essence depende também da escolha opcional de uso em projetos todo mês. Uso pontual, necessidade desconhecida ou pergunta não respondida não exibem esse convite. Pagantes e membros de workspace compartilhado continuam inelegíveis.
- **Falha ao salvar:** mostra erro e preserva a última resposta salva; não trata uma resposta não confirmada como utilidade.

A oferta lê preço e Nodes de `lib/plans.ts`. A estimativa de imagens usa o custo da configuração atual, com a indicação de que motor e resolução alteram consumo. O botão encaminha a `/app/billing?plan=essence&billing=monthly`; não inicia checkout nem pagamento automaticamente. Fechar a oferta continua possível. Os controles de saldo insuficiente continuam disponíveis quando uma operação exige mais Nodes do que o saldo.

## Retomada e continuidade — 15/10/2026

Uma referência própria em JPG, PNG ou WebP é guardada com configuração, materiais, referências de materiais já enviadas, orientação escrita e objetivo. O arquivo permanece no navegador, sem upload automático. Há um rascunho por conta por navegador, com validade de sete dias e limpeza de vencidos na visita seguinte. O exemplo de exploração e o motor interno Orion não geram rascunho. Formatos convertidos usam o mesmo JPEG que a geração receberia.

O cartão de retomada aparece em Renderizar e no dashboard, inclusive para quem já gerou antes. O link do dashboard pede restauração explícita por `?resume=1`. Restaurar não inicia geração nem altera motor/resolução silenciosamente. Configurações inválidas, versões incompatíveis e dados de outra conta são recusados. A chave React da tela também inclui o usuário autenticado para não reaproveitar estado entre contas.

Uma imagem recém-selecionada, um render aberto pelo histórico, `?source=` e um handoff do assistente têm prioridade sobre o rascunho. Ajustes são guardados com debounce e tentativa de gravação ao sair/ocultar a página. O status só confirma salvamento depois do término da transação. Navegação muito rápida ou fechamento forçado podem interromper a última gravação; o aviso de salvamento permanece até confirmação. Armazenamento bloqueado ou cheio mostra aviso e mantém a geração disponível. O arquivo pode ser removido pelo navegador ou pelo usuário; não há sincronização entre dispositivos.

Após uma geração bem-sucedida, o rascunho daquela tentativa é removido. Escritas e remoções são ordenadas, e a remoção exige o ID esperado para preservar outro rascunho mais novo. Um erro de geração conserva o rascunho. O descarte manual fica disponível antes de retomar.

Após utilidade positiva salva, o usuário pode ajustar a mesma imagem ou preparar outra. Preparar outra apenas abre o seletor; cancelar mantém o resultado. A pergunta opcional de continuidade tem três respostas: só neste projeto, em projetos todo mês, ainda não sei. Somente a necessidade mensal habilita a oferta contextual para uma conta já elegível. Essa preferência fica localmente por render e gera um evento de intenção; não substitui feedback de utilidade, checkout ou pagamento.

### Medição da nova versão

O evento existente `cta_clicked` registra `onboarding_step_viewed`, com fase (`upload`, `configure`, `generating`, `done`), origem e `flow_version=2026-10-15`; registra também disponibilidade, retomada, descarte e escolhas de continuidade. Nenhum evento contém arquivo, nome de arquivo, imagem, material ou texto de orientação. O exemplo não entra na sequência de etapas reais. A exposição é deduplicada por tentativa/fase na sessão; uma nova visita pode emitir nova exposição.

Para investigar abandono, reunir as mesmas contas por origem e coorte, deduplicar exposição por conta/tentativa e observar a etapa seguinte numa janela definida. Sessão incompleta ou sem resposta continua desconhecida; não equivale a rejeição. Reconciliar geração com eventos do servidor e utilidade com feedback autenticado. Esta entrega instrumenta a observação, sem afirmar taxas de abandono ou ganho de conversão. A pergunta, opções, salvamento e elegibilidade do feedback de utilidade permanecem iguais; a política da oferta mudou nesta versão e deve ser distinguida em comparações.

Verificação em 15/10: TypeScript aprovado, 37 testes aprovados e ESLint sem erros (quatro avisos preexistentes de imagens). Doze cenários de navegador, com IndexedDB real, verificaram restauração após recarregar, alteração persistida, dashboard, isolamento entre contas, indisponibilidade/recuperação do armazenamento, exemplo descartável, descarte manual, limpeza após geração simulada, oferta pontual/desconhecida/mensal, inelegibilidade, prioridade do histórico, eventos por fase e tela de 390 px. No Safari, cancelar a próxima imagem preservou o resultado; um arquivo público escolhido no seletor foi recuperado após recarregar. Autenticação, upload, geração e feedback foram simulados na prévia; nenhum fornecedor de imagens ou pagamento real foi chamado.

## Vídeos

Dois MP4 H.264, 1280×720, com legendas incorporadas e arquivos WebVTT:

- `public/onboarding/first-image.mp4`: 60 segundos, exemplo de uma fachada configurada na plataforma: referência → exterior → cena residencial → Golden Hour → materiais originais → intenção → saída 2K → conferência de custo.
- `public/onboarding/review-result.mp4`: 14 segundos, comparação → feedback → ajuste ou continuidade.

O primeiro vídeo foi atualizado em 13/10/2026 a pedido de Vinícius. Usa capturas da interface em produção com a vista demonstrativa `public/demo-sketch.jpg` realmente carregada. A sequência seleciona Exterior, Residencial / Fachada Residencial, Golden Hour, materiais sem alterações, uma orientação escrita e Vega 2K. O custo observado era 20 Nodes; o vídeo explica que motor e resolução alteram consumo. Termina com o botão Gerar render habilitado, antes de iniciar uma geração paga. Não apresenta resultado novo nem depoimento de cliente. Os recortes preservam os controles e suas seleções, com destaques visuais para orientar a atenção; omitem nome e saldo da conta.

O vídeo de avaliação continua usando o par de imagens demonstrativas com cartelas de orientação. Ambos são legendados e sem locução. O vídeo de configuração está disponível tanto ao escolher a referência quanto durante a configuração. Só é carregado depois da escolha de assistir, não tem autoplay e é removido ao fechar a introdução.

Reconstrução, com Pillow, ffmpeg e uma fonte TrueType via `--font`:

- `scripts/build-onboarding-case-video.py`, usando os recortes em `docs/onboarding-video/facade/`, para a configuração.
- `scripts/build-onboarding-clips.py`, para a avaliação. Esse script preserva o vídeo de configuração e sua entrada no manifesto.

## Medição

A introdução e os vídeos usam o evento existente `cta_clicked`, com valores de `cta` para início, escolha de entrada, primeira ação, comparador, abertura, reprodução e término do vídeo. Não há novo tipo de evento nem migração de banco.

| Evidência | Fonte | Interpretação |
| --- | --- | --- |
| Introdução vista | `onboarding_completed`, com outcome | Exposição à orientação. |
| Escolha e início de ação | `cta_clicked` | Intenção de uso; não prova geração nem utilidade. |
| Geração concluída | `generation_completed` / `first_generation`, emitidos pela API | Resultado técnico. |
| Render considerado útil | `render_feedback.useful = true` | Resposta positiva explícita. |
| Resposta negativa | `render_feedback.useful = false` | Resultado ainda sem utilidade para a pessoa. |
| Sem avaliação | Ausência de resposta | Utilidade desconhecida. |
| Oferta vista | `plans_viewed`, surface `render_result` | Oferta exibida após confirmação de utilidade. |
| Assinatura paga | Primeira fatura positiva vinculada à assinatura, conciliada pelo fluxo existente | Conversão paga; clique, checkout aberto e compra avulsa são diferentes. |

Experimento prioritário: comparar a proporção de novas contas externas com resultado útil confirmado em sete dias, antes e depois da atualização, declarando maturação, origem e limitações. Acompanhar também resposta à pergunta de utilidade, tempo até resultado, assinatura paga e retorno. Sem grupo comparável ou volume suficiente, relatar resultado observado e pesquisa qualitativa, sem atribuir causalidade.

## Verificação desta implementação

- Checagem TypeScript aprovada.
- 29 testes de rotas de onboarding, políticas de oferta, endpoint de avaliação e catálogo do funil aprovados.
- 20 verificações de navegador em componentes reais, com autenticação, navegação e respostas da API simuladas na prévia: os três caminhos, reabertura, Escape, vídeo, celular, estados positivo/negativo/desconhecido e erro de gravação.
- Banco conectado: coluna existente e políticas de SELECT/UPDATE de `profiles` conferidas por consulta somente de metadados. Nenhuma alteração de schema ou escrita em contas de clientes.
- MP4: duração, dimensões e ausência de faixa de áudio verificadas.
- Atualização do vídeo em 13/10: TypeScript e os mesmos 29 testes aprovados; 9 verificações adicionais de navegador confirmaram acesso nas fases de referência e configuração, reprodução decodificada em 1280×720 com duração de 60 segundos, legendas e capa corretas, ausência de autoplay, fechamento do player, layout sem overflow e preservação do vídeo de avaliação. A interface foi verificada em prévia com os componentes reais; as capturas do caso foram feitas na plataforma em produção.
- Interações de 14/10: TypeScript e os mesmos 29 testes aprovados; ESLint sem erros (quatro avisos preexistentes de imagens). Sete cenários de navegador com `GenerateClient` real verificaram exemplo sem geração/upload, mudança de iluminação refletida no resumo, escolha e cancelamento de arquivo no Safari, falha e recuperação do exemplo, objetivo de materiais com foco no painel, celular de 390 px sem overflow e checklist sem aprovação ou oferta. A reabertura manteve o objetivo na sessão. Serviços e autenticação simulados; nenhum render pago.
- Build de produção com webpack aprovado. O Turbopack local rejeita o compartilhamento de dependências por link entre checkouts; o código compila com dependências normais e webpack. As variáveis públicas necessárias à pré-renderização foram fornecidas só ao processo de build.

A prévia verifica interfaces e contratos com respostas de exemplo. Não cria uma geração paga, sessão OAuth ou compra real e não comprova ganho de conversão; essa leitura depende das coortes após a publicação.

## Ajuste guiado após “Ainda não” — 19/10/2026

O link de recuperação transporta apenas o id do render e um motivo conhecido.
A página autentica e carrega a saída persistida do próprio usuário. URLs enviadas
junto de um link de recuperação não substituem essa imagem. Vídeo, ampliação,
teste interno e render incompleto não são elegíveis.

- Luz: sugestões editáveis para luz natural, clarear, suavizar ou aquecer.
- Materiais: superfície/seleção e descrição/amostra preparam o pedido real.
  Preparar é opcional: o usuário também pode escrever diretamente no editor.
- Geometria: comparação entre entrada e saída, checklist local e retorno à
  revisão no Renderizar. Se a configuração antiga não puder ser restaurada,
  a referência original continua disponível pelo parâmetro source. Nenhuma
  geração é iniciada pelo link ou pelo checklist.
- Outros motivos: orientação para um ajuste por vez, com pedido livre.

Os editores V4 (produção) e V3 mostram uma revisão antes da execução: ação,
pedido, área/amostra, configurações de precisão e custo vigente em Nodes.
Cancelar não envia a edição. No V3, a cotação precisa corresponder ao pedido
atual; uma cotação antiga não autoriza a confirmação. No V4, o preço vem do
servidor, pelo mesmo catálogo da execução. No fluxo guiado, a expansão automática
de área começa desligada; se o usuário a habilitar, a revisão informa isso.
O V4 também usa trava síncrona contra duplo envio. Uma nova imagem encerra a
associação da recuperação. No celular, o V4 guiado dispõe imagem e controles
em sequência, com rolagem; os demais acessos mantêm a apresentação existente.

Após uma edição bem-sucedida com job persistido, a pergunta continua exatamente
“Este render serviu para o seu projeto?”, com Sim / Ainda não e motivos opcionais.
A avaliação original em render_feedback permanece intacta. O endpoint autenticado
`/api/renders/:renderId/recovery/:jobId/feedback` verifica dono, conclusão e a
cadeia de imagens entre render e edição (até os 100 jobs concluídos mais recentes
desse dono desde o render). Jobs de outra pessoa, sem saída ou sem vínculo são
recusados. Sem job persistido, a edição permanece utilizável e a avaliação não
é apresentada como confirmada.

As respostas são registradas no mecanismo first-party existente,
marketing.acquisition_events, como result_approved/result_rejected, com objeto
metadata.recovery_feedback (render_id, job_id, useful, reason, nodes_cost,
charged), feature editar e flow_version 2026-10-19. O objeto aninhado é exclusivo
da rota; o coletor público aceita somente propriedades escalares. A gravação
precisa confirmar persistência antes de a interface confirmar a resposta. GET
recupera a última resposta desse dono/render/job. Não há migração de schema.

Os eventos de navegação/preparo usam cta_clicked e os identificadores
onboarding_recovery_started, onboarding_recovery_viewed e
onboarding_recovery_prepared. Eles não comprovam utilidade. O gasto vem do job
do servidor, não do número mostrado pelo cliente. Para analisar recuperação,
considere a última resposta por render_id/job_id, separe versões, tráfego interno
e origem/coorte, e cruze com a avaliação negativa original; silêncio continua
com utilidade desconhecida. Não somar cada troca de resposta como pessoa nova.

Somente uma resposta útil salva permite os próximos passos. A oferta continua
restrita à conta gratuita individual elegível e à necessidade mensal declarada.
Preço vem do catálogo vigente; não há cobrança nem assinatura automática.
