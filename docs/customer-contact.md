# WhatsApp obrigatório na conclusão do cadastro

Implementação local de 30/09/2026 para a primeira equipe de ativação e vendas da SpaceNode.

## Comportamento

Quando `WHATSAPP_SIGNUP_ENABLED=true`, o layout autenticado de `/app` exige o contato antes de montar a interface do produto. Isso abrange cadastro por e-mail e Google. O formulário ocupa a rota de destino atual; após salvar, `router.refresh()` retoma essa mesma URL, preservando a intenção de plano e os parâmetros do checkout.

O telefone é obrigatório. Acompanhamento de uso e ofertas têm escolhas independentes, desmarcadas inicialmente. Nenhuma delas é condição para concluir o cadastro. A tela Conta permite alterar o número e as escolhas. Editar o número desmarca as opções para uma nova escolha. Não existe envio de WhatsApp nesta alteração.

A migração dispensa os usuários que já existem em `auth.users` no momento da aplicação. Novas contas não têm linha de contato até concluir o formulário. `signup_exempt` só pode ser escrito pelo servidor; o endpoint nunca aceita esse campo do navegador.

## Dados e acesso

- `public.customer_contacts`: telefone E.164, preferências, versão do aviso, origem, datas, dispensa do cadastro legado e verificação futura.
- `public.customer_contact_events`: histórico das mudanças de preferência, com data do banco e sem cópia de números antigos.
- RLS permite ao usuário ler somente suas linhas. `anon` não lê contatos; `authenticated` não insere nem altera essas tabelas diretamente.
- `PUT /api/users/me/contact` exige sessão verificada, origem igual à aplicação, JSON limitado e campos conhecidos. A identidade vem exclusivamente da sessão. A escrita usa o cliente administrativo existente apenas no servidor.
- Triggers com `SECURITY INVOKER` ficam no schema privado `spacenode_contacts`. A atualização e seu histórico são atômicos. Atualizações sem mudança de número, escolhas ou aviso não criam outro evento.
- Telefone e preferências não vão para logs, cookies, metadados de autenticação ou ferramentas de análise. A resposta de gravação retorna apenas `{ok: true}`.

O texto do aviso está versionado em `lib/customer-contact/validation.ts` como `2026-09-30-v1`. Se o significado mudar, criar uma nova versão e preservar a referência da anterior.

## Limites conhecidos

- A validação confere formato, incluindo DDD e celular brasileiro, e aceita formato internacional iniciado por `+`. Não confirma a existência do número, titularidade ou cadastro no WhatsApp. `whatsapp_verified_at` permanece nulo; trocar o número limpa eventual verificação anterior.
- O gate é uma etapa da interface autenticada. Não substitui autenticação/autorização nas APIs nem bloqueia chamadas diretas às APIs existentes do produto.
- Nenhum dado é transmitido à Meta por esta implementação. Integração de canal, templates, consentimento antes do envio e mensagens ficam para a próxima etapa.
- Uma indisponibilidade de leitura mostra erro recuperável na etapa de contato quando a chave está ativa. Desativar a chave reverte o gate sem apagar os dados.

## Implantação

1. Revisar a migração `20260930063840_customer_whatsapp_contact.sql` e aplicá-la ao ambiente de teste.
2. Conferir isolamento com duas contas, gravação, revogação de preferências e fluxo de conta legada.
3. Testar cadastro por Google e e-mail, inclusive chegada a `/app/billing` com parâmetros de plano.
4. Aplicar a migração ao ambiente de produção e publicar o código junto com a atualização factual da política de privacidade.
5. Ativar `WHATSAPP_SIGNUP_ENABLED=true` no servidor e verificar um novo cadastro controlado. Sem a variável, o comportamento atual permanece.

A migração foi aplicada aos bancos de desenvolvimento e produção em 01/10/2026,
após testar isolamento de duas contas e o histórico de revogação em uma
transação revertida no banco de desenvolvimento. O código aguarda publicação
e o flag `WHATSAPP_SIGNUP_ENABLED` continua desligado. A migração foi testada em PostgreSQL isolado (PGlite 0.5.8), com `auth.users`, papéis e `auth.uid()` simulados. Isso verifica SQL, permissões e triggers, mas não substitui a integração com Auth, Data API e o ambiente real do Supabase.

## Verificação local

```sh
npm test -- tests/customer-contact.test.ts tests/customer-contact-route.test.ts tests/auth-intent.test.ts
npm run typecheck
```

Resultado: 24 testes passaram; lint dos arquivos alterados e checagem de tipos passaram. A prévia renderiza os componentes reais com navegação simulada e estilos básicos de teste. A validação de número inválido foi conferida no navegador; nenhum usuário real foi criado ou modificado.

Referência de acesso: [documentação oficial de RLS do Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).
