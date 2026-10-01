# Produto e Stripe → revisão privada na VPS

Código preparado sobre `origin/main` atualizado em 01/10/2026. As tabelas de
preferências foram aplicadas ao Supabase de desenvolvimento, verificadas com
duas contas isoladas e histórico de mudança/revogação, e aplicadas à produção.
Os flags da interface e da origem individual continuam desligados; a nova
credencial e a conexão da VPS permanecem pendentes.

## Entrada privada

`GET /api/internal/commercial/snapshot` só funciona quando
`COMMERCIAL_PILOT_ENABLED=true`, `COMMERCIAL_SOURCE_TOKEN` e
`COMMERCIAL_REF_SECRET` têm pelo menos 48 caracteres. Sem configuração retorna
503; uma chave ausente ou errada retorna 401 antes de consultar dados.

A chave de origem será exclusiva, compartilhada apenas entre os servidores do
produto e da VPS. A chave de ingestão já existente na VPS não é reutilizada nem
copiada para o produto. O segredo de referências permanece somente no produto e
deve ficar estável ao trocar a chave de acesso; trocá-lo altera as referências.
Guardar esses valores como configurações protegidas, nunca como variáveis
`NEXT_PUBLIC_*`, JSON de workflows, commits ou registros de atendimento.

O servidor usa o cliente administrativo existente para consultar apenas os
campos necessários. Telefones, e-mails, nomes, prompts, imagens, IDs públicos e
identificadores do Stripe não entram no retrato retornado. Referências de contas
são HMAC-SHA256 com o segredo de referências; IDs de eventos também são opacos.
O retrato contém preferências, etapa operacional e sinais de uso e suporte.
É dado individual pseudonimizado e deve permanecer na operação privada.

## Reconciliação do checkout

Cada checkout dos últimos 24h precisa de registro server-side com `dedupe_key`
`checkout:cs_*`. O servidor consulta a sessão atual na API Stripe, verifica
assinatura, ambiente real e dono via metadata. Erro de banco/Stripe, sessão de
outra conta ou modo de teste interrompem a leitura inteira com 503, sem expor
os detalhes do provedor. Não se torna uma recuperação apenas por haver evento.

Pagamento `paid` e `no_payment_required` retiram a recuperação. Plano pago,
assinatura já vinculada e créditos positivos Stripe também bloqueiam
conservadoramente a recuperação de primeira compra. Aqui `state=paid` é uma
trava comercial; não é indicador de receita liquidada ou cliente pagante novo.
Não houve mudança no webhook financeiro, cobrança ou concessão de Nodes.

Checkout recente com menos de 30 minutos, expirado, completo ainda não pago ou
com mais de 24h não gera recuperação. Limite por leitura: 100 contas cadastradas
nos últimos 30 dias, 10 consultas de checkout e 1.000 linhas por consulta de
sinais. Ultrapassar o limite falha claramente, sem publicar um lote parcial.
Estes limites são do piloto; ampliar depois de definir paginação e reconciliação.

## Ativação e atendimento

Preferências vêm somente de `customer_contacts`. Não são inferidas do telefone
legado nem do consentimento de anúncios. A migração existente mantém contas
anteriores dispensadas do novo passo, com preferências falsas.

`first_value` usa aprovação/download registrado; render concluído sozinho não
comprova valor percebido. Ele deixa `activation_eligible=false`, uma trava
separada que impede abordagem dizendo que a pessoa ainda não obteve resultado.
Tarefas existentes são revalidadas quando essa trava muda.

Toda conta é enviada com `do_not_contact=true`: o histórico compartilhado de
abordagens e a passagem para atendimento humano ainda precisam ser integrados.
O piloto apenas registra contexto e tarefas bloqueadas. Não envia mensagens nem
chama IA. Alterar essa trava exige implementar o histórico e revisar o fluxo de
entrega, não apenas desligar uma variável.

## Implantação preparada

1. Aplicar a migração existente de contato no banco de produção após conferir os
   testes de isolamento, histórico de mudança e revogação em desenvolvimento.
2. Publicar o código mantendo os flags desligados; verificar 503 sem configuração.
3. Criar a chave exclusiva de origem e o segredo estável de referências, ativar a
   origem e verificar 401 sem chave e um retrato válido com chave.
4. Atualizar `engine.py` na VPS com `activation_eligible`, instalar `source_sync.py`
   e usar `compose.yaml`, `compose.workforce.yaml` e `compose.source.yaml`.
5. Iniciar apenas `commercial_sync`. O processo consulta o produto a cada cinco
   minutos e envia os retratos à fila pela rede interna. Não expõe porta pública.
   O healthcheck exige uma sincronização bem-sucedida nos últimos 11 minutos.
6. Ativar a coleta de contato somente após conferir um cadastro controlado;
   testar retirada de preferências e checkout pago antes de ampliar o piloto.

O conector da VPS rejeita campos desconhecidos, dados antigos, respostas maiores
que 1 MiB, redirecionamentos e qualquer retrato que tente liberar contato proativo.
Erros não imprimem tokens, registros ou respostas do provedor. Backups da fila e
monitoramento de falhas de sincronização continuam necessários.

Documentação consultada: [webhooks Stripe](https://docs.stripe.com/webhooks),
[funções do Supabase](https://supabase.com/docs/guides/database/functions).
