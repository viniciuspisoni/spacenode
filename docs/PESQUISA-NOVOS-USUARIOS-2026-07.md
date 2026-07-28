# Pesquisa — novos usuários (cadastros reais)

**Data da apuração:** 28/07/2026
**Fonte:** projeto Supabase de produção `nucyyqmurhnakhldshwr` (`profiles`, `auth.users`,
`spaces`, `vistas`, `renders`, `edit_v3_jobs`, `nodi_events`, `user_monthly_usage`)
**Recorte:** coorte da campanha = cadastros de **23/07 a 28/07** (58 usuários), comparada
com toda a base anterior (19 usuários, 21/04 a 22/07).

> Todas as consultas usadas estão no [Apêndice](#apêndice--consultas). Os números são
> agregados; nenhum dado pessoal foi copiado para este documento.

---

## 1. Resumo

A campanha de lançamento funcionou como **aquisição** e falhou como **ativação**.

O topo do funil multiplicou por ~48× — de 0,2 para 9,7 cadastros/dia. O fundo não se
mexeu: **0 assinaturas**, **1 usuário voltou em outro dia**, e **53% dos novos usuários
nunca gastaram um único node**.

A causa não é técnica. Nenhuma geração da coorte nova falhou (0 vistas com `status =
'failed'`, 0 renders com erro). A causa é econômica e está no caminho padrão do produto:
**os 40 nodes grátis compram exatamente uma imagem, sem direito a uma segunda tentativa.**

---

## 2. Aquisição — o que a campanha trouxe

Cadastros por dia desde a ativação da oferta (24/07):

| Dia    | Cadastros |
| ------ | --------- |
| 23/07  | 3         |
| 24/07  | 10        |
| 25/07  | 9         |
| 26/07  | 10        |
| 27/07  | 17        |
| 28/07  | 9 (parcial) |

| Período                     | Usuários | Média/dia |
| --------------------------- | -------- | --------- |
| 21/04 – 22/07 (93 dias)     | 19       | 0,2       |
| 23/07 – 28/07 (6 dias)      | **58**   | **9,7**   |

**58 dos 77 usuários da base inteira (75%) entraram nos últimos 6 dias.**

### Quem são

| Corte                | Número | Leitura |
| -------------------- | ------ | ------- |
| Google OAuth         | 50/58 (86%) | O botão do Google é a porta real. |
| E-mail + senha       | 8/58   | 2 nunca confirmaram o e-mail, 3 nunca logaram. |
| Domínio `gmail.com`  | 55/58  | — |
| Domínio `hotmail.com`| 2/58   | — |
| Domínio `.edu.br`    | 1/58   | Aluno de universidade. |
| Domínio corporativo  | **0**  | — |
| Entrou por convite de workspace | **0** | Ninguém chamou colega. |

Nenhum e-mail corporativo em 58 cadastros. O público que a campanha atraiu é de
**profissional individual e estudante**, não de escritório. Isso é coerente com a oferta
(desconto na mensalidade individual), mas significa que os planos Studio e Office não
estão sendo alimentados por esse canal — e que a viralização por equipe é zero.

---

## 3. Ativação — onde eles param

Funil da coorte de 58 usuários:

| Etapa                                          | Usuários | % do cadastro | Perda na etapa |
| ---------------------------------------------- | -------- | ------------- | -------------- |
| Cadastrou                                      | 58       | 100%          | —              |
| Concluiu o tour de onboarding                  | 54       | 93%           | −4             |
| Teve qualquer atividade registrada             | 35       | 60%           | −19            |
| Subiu um projeto (space ou render)             | 29       | 50%           | −6             |
| Extraiu o DNA (pagou 8 nodes)                  | 14       | 24%           | −15            |
| **Gerou uma imagem**                           | **14**   | **24%**       | —              |
| Gerou 3 ou mais                                | 1        | 2%            | −13            |
| Voltou em outro dia                            | **1**    | **2%**        | −13            |
| Assinou                                        | **0**    | **0%**        | −1             |

Dois pontos de fuga dominam:

**(a) 23 de 58 nunca chegaram a subir nada** — 40% somem entre a tela de boas-vindas e o
primeiro upload, mesmo com 93% tendo passado pelo tour.

**(b) 9 de 14 param no botão "gerar".** Esses usuários subiram o projeto, esperaram a
extração do DNA, **pagaram 8 nodes por ela** e abandonaram exatamente no passo seguinte —
com o espaço em `status = 'locked'`, pronto para gerar. É o ponto mais caro do funil:
o usuário já investiu tempo e saldo e vai embora sem ver uma única imagem.

### A intenção é altíssima — o tempo é curtíssimo

| Métrica                                     | Valor |
| ------------------------------------------- | ----- |
| Mediana cadastro → primeiro upload          | **1 minuto** |
| Mediana cadastro → primeira vista gerada    | **3 minutos** |
| Usuários ativos em mais de um dia           | 1 de 58 |

Ninguém "explora depois". Tudo acontece nos primeiros minutos da primeira sessão, e
depois não há segunda sessão. **Não existe janela de recuperação** — o que não converter
no minuto 3 não converte.

---

## 4. A causa: a conta dos 40 nodes não fecha

Caminho padrão de um usuário novo, com os defaults do código:

| Passo | Onde está definido | Custo |
| ----- | ------------------ | ----- |
| Extração de DNA (obrigatória) | `lib/spaces/economy.ts:9` — `DNA_EXTRACTION_COST = 8` | 8 nodes |
| Categoria padrão: `residencial` | `components/spaces/NewSpaceFlow.tsx:104` | — |
| Motor padrão dessa categoria: **Quasar** | `components/spaces/NewSpaceFlow.tsx:73,103` | — |
| Uma vista Quasar @ 2K | `lib/engines.ts:44` | 28 nodes |
| **Total** | | **36 de 40** |

**Sobram 4 nodes. A vista mais barata do catálogo custa 10.** O usuário novo tem direito a
exatamente uma imagem e nenhuma segunda tentativa — nem para trocar o ângulo, nem para
corrigir o que saiu errado, nem para comparar dois estilos.

Os dados confirmam que é isso que acontece na prática:

- **Todas as 5 vistas geradas por usuários novos foram `quasar` / `2k` / 28 nodes.** 5 de 5.
  Ninguém trocou o motor.
- **7 usuários estão com saldo exatamente 32** (40 − 8): pagaram o DNA e pararam.
- **6 usuários estão com saldo exatamente 4** (40 − 8 − 28): gastaram o teste inteiro em
  uma imagem só.
- **31 de 58 (53%) continuam com os 40 nodes intactos.**

### Isso contradiz a premissa da campanha

`docs/CAMPANHA-LANCAMENTO-2026-07.md` justifica o desconto assim:

> "40 nodes dão ~4 renders HD, o que prova que a ferramenta funciona mas não prova que ela
> aguenta um projeto."

Isso só é verdade em `/app/generate` com Pulsar HD (10 nodes). **No fluxo Spaces — que é
para onde o produto empurra o usuário novo — 40 nodes dão 1 imagem.** A campanha está
otimizando a conversão de um usuário que, segundo a premissa do próprio documento, deveria
ter provado que a ferramenta funciona. Ele não chegou lá.

### Incoerência de configuração

`lib/engines.ts:55` declara `DEFAULT_ENGINE = 'vega'` (20 nodes @ 2K), mas o fluxo de novo
espaço nunca usa essa constante: `NewSpaceFlow.tsx` inicializa o estado direto em
`'quasar'` (28 nodes) e a categoria padrão `residencial` também aponta para `quasar`. O
`DEFAULT_ENGINE` só é lido em `app/app/generate/GenerateClient.tsx:177`.

Ou seja: **o usuário novo cai no motor mais caro do catálogo por default**, e a constante
que diz qual é o motor padrão não tem efeito nenhum sobre ele.

---

## 5. Achado secundário — nodes cobrados sem entrega

Um usuário (`aab2d6f7…`, cadastro em 25/07) está com saldo 4 — ou seja, foi debitado em 36
nodes — e tem **zero vistas** no banco. O espaço dele está `locked`, com DNA extraído às
10:05:13 e travado às 10:05:36. Os 8 nodes do DNA se explicam; os outros 28 correspondem
exatamente a uma geração Quasar @ 2K que foi cobrada e não deixou registro nem imagem.

É 1 caso em 14 usuários que geraram — mas é um usuário novo que gastou 90% do teste
gratuito e não recebeu nada. Vale rastrear no log da rota de geração.

**Agravante para auditoria:** a tabela `public.node_ledger` **não existe em produção** — a
migration `20260703150000_node_ledger_ai_cost_log.sql` não foi aplicada. Sem o livro-razão,
não há como reconciliar débito × entrega; toda a apuração acima teve que ser inferida por
diferença de saldo. Enquanto isso não existir, casos como esse são invisíveis.

---

## 6. Conversão

| Métrica                                | Coorte campanha |
| -------------------------------------- | --------------- |
| Chegaram a ter `stripe_customer_id`    | 1 de 58         |
| Assinaram                              | **0**           |
| Compraram Lumens                       | 0               |

A oferta de 50% na primeira mensalidade **ainda não foi testada de verdade**. Ela só é
decidida por quem já viu valor, e só 14 pessoas (24%) viram uma imagem — nenhuma delas
viu uma segunda. O desconto está resolvendo uma objeção de preço que ninguém chegou a ter.

---

## 7. Comparação com a base anterior

| Métrica                    | Anterior (19) | Campanha (58) |
| -------------------------- | ------------- | ------------- |
| Gerou alguma imagem        | 14 (74%)      | 14 (24%)      |
| Gerou 3 ou mais            | 11 (58%)      | 1 (2%)        |
| Ativo em mais de um dia    | 10 (53%)      | 1 (2%)        |
| Total de renders           | 1.592         | 15            |
| Total de vistas            | 282           | 5             |

A base anterior é pequena e enviesada (conhecidos, testes internos, gente com acesso
acompanhado), então 74% de ativação não é uma meta realista. Mas a distância —
**74% contra 24%** — mostra que quem chegou sozinho, sem ninguém explicando, encontra um
produto que não se explica.

---

## 8. Recomendações

Em ordem de impacto sobre o funil medido, não de esforço.

1. **Fazer os 40 nodes comprarem 3–4 imagens, não uma.** Duas saídas, combináveis:
   não cobrar os 8 nodes do DNA no primeiro espaço de cada usuário (o custo real é baixo e
   hoje esse débito é a última coisa que 9 usuários fizeram antes de sumir); e colocar o
   usuário novo em **Pulsar HD (10 nodes)** por padrão. Com DNA grátis + Pulsar HD, 40
   nodes viram 4 imagens — que é exatamente o que a campanha já promete por escrito.

2. **Corrigir o default do motor.** `NewSpaceFlow.tsx` deve ler `DEFAULT_ENGINE` de
   `lib/engines.ts` em vez de fixar `'quasar'`, e a categoria `residencial` não deveria
   apontar para o motor mais caro do catálogo. Hoje 5 de 5 usuários novos foram parar no
   Quasar sem escolher.

3. **Mostrar o custo antes do investimento, não depois.** O usuário paga 8 nodes pelo DNA
   e só então descobre que a geração custa 28 dos 32 que sobraram. A conta inteira do ciclo
   precisa estar visível antes do upload.

4. **Ganhar a segunda sessão.** Zero retorno em 58 usuários, com sessão única de ~3
   minutos. Não existe hoje nenhum e-mail de retorno. O gatilho mais óbvio é o dos 9 que
   pararam no botão "gerar" com o espaço pronto: eles têm um projeto travado esperando.

5. **Instrumentar antes da próxima leva.** Aplicar a migration do `node_ledger` (débito ×
   entrega) e registrar evento de abandono entre upload e geração. Hoje o passo mais caro
   do funil só é observável por diferença de saldo.

6. **Não escalar mídia paga ainda.** Com ativação em 24% e retorno em 2%, cada real gasto
   em tráfego compra um cadastro que some em 3 minutos. Corrigir a economia do teste
   gratuito primeiro; o topo do funil já provou que responde.

---

## Apêndice — consultas

Coorte: `profiles.created_at >= '2026-07-23'`. Fuso `America/Sao_Paulo`.

```sql
-- Cadastros por dia
select (created_at at time zone 'America/Sao_Paulo')::date as dia, count(*)
from public.profiles where created_at >= now() - interval '60 days'
group by 1 order by 1;

-- Origem do cadastro
select coalesce(u.raw_app_meta_data->>'provider','?') as provider, count(*),
       count(*) filter (where u.email_confirmed_at is not null) as confirmado
from auth.users u join public.profiles p on p.id = u.id group by 1;

-- Funil de ativação
with c as (select id from public.profiles where created_at >= '2026-07-23')
select
  count(*) filter (where sp.locked > 0)                as dna_pago,
  count(*) filter (where sp.locked > 0 and vi.n = 0)   as parou_no_botao_gerar,
  count(*) filter (where sp.qtd = 0 and re.n = 0)      as nunca_subiu_nada
from c
join lateral (select count(*) qtd, count(*) filter (where status='locked') locked
              from public.spaces s where s.user_id = c.id) sp on true
join lateral (select count(*) n from public.vistas  v where v.user_id = c.id) vi on true
join lateral (select count(*) n from public.renders r where r.user_id = c.id) re on true;

-- Distribuição de saldo (40 = nunca gastou; 32 = só o DNA; 4 = DNA + 1 vista Quasar 2K)
select credits, count(*) from public.profiles
where created_at >= '2026-07-23' group by 1 order by 1 desc;

-- Motor/qualidade efetivamente usados pelos novos
select v.engine, v.quality, v.nodes_cost, count(*), count(distinct v.user_id)
from public.vistas v join public.profiles p on p.id = v.user_id
where p.created_at >= '2026-07-23' group by 1,2,3;

-- Retorno em outro dia (união de todas as tabelas de atividade)
with c as (select id, (created_at at time zone 'America/Sao_Paulo')::date dia_cad
           from public.profiles where created_at >= '2026-07-23'),
ev as (select user_id, (created_at at time zone 'America/Sao_Paulo')::date d from public.spaces
  union all select user_id, (created_at at time zone 'America/Sao_Paulo')::date from public.vistas
  union all select user_id, (created_at at time zone 'America/Sao_Paulo')::date from public.renders
  union all select user_id, (created_at at time zone 'America/Sao_Paulo')::date from public.nodi_events
  union all select user_id, (created_at at time zone 'America/Sao_Paulo')::date from public.edit_v3_jobs
  union all select user_id, (created_at at time zone 'America/Sao_Paulo')::date from public.blocos3d_jobs)
select count(distinct c.id) filter (where ev.d > c.dia_cad) as ativos_em_outro_dia
from c left join ev on ev.user_id = c.id;
```

### Ressalvas de método

- **Coorte jovem.** Quem se cadastrou em 27–28/07 teve 1–2 dias de janela. O número de
  retorno (1 de 58) sobe um pouco com o tempo; a ativação de primeira sessão, que é medida
  em minutos, não.
- **`auth.users.last_sign_in_at` não serve para medir retorno** — a sessão do Supabase se
  renova por refresh token e o campo não é atualizado. O retorno acima foi medido por
  atividade real (união das tabelas), não por login.
- **Gasto de nodes inferido por saldo.** Sem `node_ledger` em produção, a atribuição de
  cada débito a um job é uma reconstrução a partir da tabela de custos, não um registro.
