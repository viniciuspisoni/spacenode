# Validação em desenvolvimento — PR #221

16/09/2026, pelo navegador, contra o projeto Supabase de **desenvolvimento**
(`aehmbapbbrefglsrkrgs`). Nada tocou produção.

## Ambiente

- Migrations do repo aplicadas no projeto de desenvolvimento (43 das 63; as 20
  que falharam são de tabelas fora deste escopo — workspaces, edits, spaces,
  lumen_packs — cujo estado no projeto estava desatualizado. Nenhuma delas é
  lida pelos caminhos sob teste, e o `/app` renderizou inteiro mesmo assim,
  porque `getPayerBalance` já degrada sem a view `user_node_balance`).
- `schema marketing` exposto no PostgREST do projeto de desenvolvimento.
- Dev server na worktree, `localhost:3400`, `.env.local` apontando para o
  projeto de desenvolvimento (apagado no fim).
- Duas contas de teste criadas pela Admin API. A primeira teve
  `auth.users.created_at` **forçado para 10/09** — é o cenário exato do defeito:
  conta antiga cujo evento só nasce hoje.

## O que foi verificado

### 1. Signup registrado uma única vez

Login da conta 1 → `/app`. Uma linha em `marketing.acquisition_events`. Depois
de mais duas visitas ao `/app` (incluindo uma navegação para outra rota e
volta): **continua uma linha**. `localStorage` com a chave
`sn_attr_bound:<user_id>` = `1`.

A chave agora tem o id da conta. Com a conta 2 logada no **mesmo navegador**, a
chave da conta 1 não bloqueou a tentativa — que é o defeito antigo: flag global
fazia a segunda conta da mesma máquina nunca vincular.

### 2. Data correta do cadastro

Conta 1, cadastrada em 10/09 e vinculada em 16/09:

| Coluna | Valor |
|---|---|
| `occurred_at` (o fato) | `2026-09-10 21:40:15+00` |
| `created_at` (o registro) | `2026-09-16 20:20:36+00` |

Seis dias de diferença, cada data na sua coluna. Conta 2, vinculada um minuto
depois de criada: `occurred_at` 20:21:52, `created_at` 20:22:53.

No relatório (`getFunnelSnapshot`, a mesma função do painel de ads), com a
linha marcada como pública para o teste:

- recorte **10/09 → 10/09**: `signups: 1` (o cadastro aparece no dia em que
  aconteceu, embora a linha tenha sido gravada no dia 16);
- recorte **16/09 → 16/09**: `signups: 1` — e é outro cadastro, não este. Pela
  regra antiga (`created_at`) o de 10/09 apareceria aqui e o dia 10 ficaria
  vazio.

### 3. Nova tentativa depois de falha de gravação

Gatilho instalado no banco de desenvolvimento para fazer o INSERT de signup
falhar só para a conta 2.

- Com o gatilho: `/app` carregado, **zero linhas** para a conta 2, **nenhuma
  chave** `sn_attr_bound` para ela, e o log do servidor com
  `[marketing/ads] falha ao gravar evento signup: QA: falha simulada`.
  É o ponto do defeito: antes a rota respondia `200 {ok:true}`, o browser
  marcava "vinculado" e o cadastro sumia do funil para sempre.
- Gatilho removido, `/app` recarregado: **uma linha** gravada e a chave
  `sn_attr_bound:<user_id>` = `1`.

A linha resultante saiu com `origin = unknown` (sem cookie de campanha e sem
jornada anônima anterior) — **não** `organic`, que era a atribuição inventada
que esta PR remove.

### 4. Tráfego interno fora dos relatórios

Visita a `/lp/render-sem-espera?utm_source=meta&utm_campaign=qa_teste` em
`localhost:3400`: evento `lp_view` gravado com **`is_internal = true`** e
`origin = paid`. É exatamente a visita que contaminou o relatório de 16/09 —
agora gravada e quarentenada na origem.

No relatório, recorte de 16/09 com **três cadastros no banco** dentro da janela
(dois internos, um público): `signups: 1`. O interno fica na base e fora da
conta.

Também confirmado no mesmo teste: `lp_view` com marcador de campanha nasce
`origin = paid`, sem marcador nasce `origin = unknown` — nunca `NULL`.

### 5. Backfill, em banco real

As três contas que já existiam no projeto de desenvolvimento e não tinham
evento de signup ganharam um, com `occurred_at` igual ao `created_at` delas em
`auth.users` (13/07) e `origin = unknown`. É o mesmo caminho que criará os 70
eventos que faltam em produção.

## Achado que apareceu na validação: a maior contaminação não era o dev server

Investigando se o `npm run build` local tinha escrito em produção (**não
escreveu** — `/lp/[slug]` é `force-dynamic` e o build não renderiza a rota), a
conferência dos IPs em `public.rate_limits` mostrou outra coisa:

| Dia | IPs distintos na LP — rastreador do Meta | Demais |
|---|---|---|
| 16/09 | **184** | 33 |
| 15/09 | **221** | 38 |
| 14/09 | 0 | 4 |

A rajada que levantou a suspeita — 21 `lp_view` em 12 segundos, todos com
`referrer` nulo — veio da faixa `173.252.0.0/16`, que é do Meta. É o
rastreador que busca o destino do anúncio de várias máquinas ao mesmo tempo.

Isso é maior que o problema que esta PR foi escrita para resolver: nos dois
dias de campanha, a maioria das "visitas" da landing page não é gente. E chega
pelo host de **produção**, então a checagem de host não pega.

Por isso entrou aqui uma quarta marcação, pelo user agent declarado
(`isBotUserAgent`), aplicada só na landing page — os outros eventos nascem de
JavaScript, que rastreador de link não executa. A lista é de robôs conhecidos e
nomeados; ausência de user agent **não** conta como robô, porque esse erro
esconderia visita real sem deixar rastro.

Verificado no navegador/servidor de desenvolvimento: a mesma URL pedida com
user agent `facebookexternalhit` grava `is_internal = true` com
`metadata.nao_mercado = 'bot'`; com user agent de iPhone, a marcação vem do
ambiente (`'ambiente'`), que é o correto em `localhost` — em produção essa
segunda visita seria `is_internal = false`.

**Esta parte é adição minha ao escopo pedido.** Está isolada num arquivo e numa
linha da landing page, e a decisão de manter ou tirar é sua. O que não dá é
ler o funil da LP sem saber disto: o histórico **não** tem como ser marcado
retroativamente, porque o user agent nunca foi gravado.

## Correções feitas durante a validação

- `origin` de eventos que não são cadastro nascia `NULL` nas linhas novas
  (enquanto o backfill preenchia as antigas) — um `group by origin` misturaria
  "sem informação" com "campo não preenchido". Agora deriva `paid` com marcador
  de campanha e `unknown` sem. Teste novo em `tests/analytics-confiabilidade.test.ts`.
- Comentário apontava para `docs/ANALYTICS.md`, que não existe no repo.

## Limitações do que foi verificado

- **Não é produção.** O projeto de desenvolvimento tem 20 migrations em atraso
  e nenhum dado real. O que foi exercitado é o caminho de código, não o volume.
- **O painel `/admin/marketing/ads` não foi renderizado.** O que rodou foi
  `getFunnelSnapshot`, a função que o painel consome, através de uma página
  temporária de QA (apagada antes do commit). A camada visual do painel não foi
  olhada.
- **`origin = organic`** não foi exercitado pelo navegador: exige uma jornada
  anônima gravada antes do cadastro, com o mesmo `sn_aid` e sem marcador pago.
  Está coberto por teste unitário, não por browser.
- **Cookies não separam por porta.** O `sn_attribution` de uma sessão de
  desenvolvimento em `localhost:3200` apareceu no teste em `localhost:3400` e o
  primeiro cadastro saiu como `paid` por causa disso. É artefato de
  desenvolvimento, não de produção — mas explica por que um teste local pode
  "herdar" atribuição de outro.
- **Retentativa e limite de taxa.** Enquanto a gravação falha, cada visita ao
  `/app` tenta de novo, com o teto de 10 tentativas por hora por usuário que já
  existia na rota. Numa indisponibilidade longa o usuário bate o teto e volta a
  tentar na hora seguinte. Em desenvolvimento o React monta o efeito duas
  vezes, então aparecem duas tentativas por carregamento; em produção é uma.
- **O retroativo de tráfego interno continua parcial**, pelo motivo que este
  teste tornou visível: o `lp_view` de desenvolvimento chegou com `referrer`
  nulo. Sem rastro, uma linha antiga de teste é indistinguível de uma visita
  real — daí só 3 linhas serem marcadas em produção.
