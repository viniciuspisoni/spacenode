# Cadastros de 14–16/09/26 e confiabilidade do funil

Levantamento feito em 16/09/2026, 17h BRT, sobre o Supabase de produção.
Datas em BRT (America/Sao_Paulo). Identificadores mascarados — o e-mail
completo está no banco, não aqui.

---

## 1. O que aconteceu com os 4 cadastros sem evento

**Causa: os 4 são anteriores ao deploy da PR #211.** O gate antigo só gravava o
evento de `signup` quando existia cookie de campanha; cadastro sem campanha não
gerava evento nenhum. O deploy entrou em **15/09 às 17:51 BRT** e a linha
divide a amostra exatamente:

| Janela | Contas | Com evento | Sem evento |
|---|---|---|---|
| Antes do deploy da #211 | 144 | 74 | **70** |
| Depois do deploy da #211 | 3 | **3** | 0 |

Dos 8 cadastros de 14–16/09, 4 são pré-deploy sem campanha (nunca geraram
evento), 1 é pré-deploy **com** campanha (gerou, pelo caminho antigo) e 3 são
pós-deploy (todos geraram). Não é um defeito novo: é o rastro do defeito
antigo. A cobertura depois da correção é 3/3.

O buraco real não é de 4 contas, é de **70**.

### Três defeitos que continuavam abertos

1. **O evento de signup chega atrasado e o relatório data pelo atraso.**
   O bind roda no primeiro acesso ao `/app`. Uma conta de 10/09 gerou evento
   em 16/09 às 13:27 — seis dias depois. Como todo relatório recortava por
   `created_at` da linha, esse cadastro entrava no dia errado.
2. **Ausência de cookie virava "orgânico".** `metadata.organic = !snapshot`:
   não saber a origem era gravado como origem conhecida.
3. **Falha de escrita apagava o cadastro do funil para sempre.** O endpoint
   respondia `200 {ok:true}` mesmo quando o insert falhava, e o browser
   gravava um flag permanente de "já vinculado". Pior: o flag era **global do
   navegador** — a segunda conta criada na mesma máquina nunca vinculava.

---

## 2. Tráfego de desenvolvimento misturado com o real

O `.env.local` da máquina de desenvolvimento aponta para o Supabase de
**produção**. Rodar `npm run dev` grava evento de mercado: nos `lp_view` de
16/09 há visitas com referrer `http://localhost:3200/lp/print-do-sketchup`.

O que a correção faz, sem apagar uma linha sequer:

- evento novo nasce com `is_internal` decidido pelo **host** da requisição
  (allowlist de produção) e pelo ambiente de execução — dev e preview entram
  marcados;
- `marketing.internal_actors` + trigger marcam as contas do time mesmo quando
  o acesso vem do host de produção;
- relatórios e alertas filtram `is_internal = false`.

**Limite honesto do retroativo:** só dá para provar que um evento antigo é
interno quando ele deixou rastro. Na base de hoje isso são **3 linhas** (as de
referrer `localhost`). As outras visitas de teste de 16/09 chegaram com
referrer vazio e são indistinguíveis de visita real — ficam na base. A partir
do deploy, o host resolve na origem.

Ação que só o dono pode fazer (o e-mail não entra no repositório):

```sql
select marketing.mark_internal_actor('<e-mail da conta interna>', 'conta do dono');
```

---

## 3. Os 8 cadastros, um a um

| Ref | Conta | Cadastro | 1ª geração | Gerações | Concluídas | Falhas | Sessões | Última atividade | Spaces | Saldo | Checkout |
|---|---|---|---|---|---|---|---|---|---|---|---|
| U1 | `jad***` | 14/09 17:49 | 17:52 (**3 min**) | 5 | 5 | 0 | 2 | 15/09 00:46 | 1 | **2** de 80 | não |
| U2 | `dua***` | 15/09 10:23 | 10:29 (6 min) | 3 | 3 | 0 | 1 | 15/09 10:53 | 0 | 20 de 80 | não |
| U3 | `arq***` | 15/09 12:12 | 12:15 (3 min) | 2 | 2 | 0 | 1 | 15/09 12:18 | 0 | 40 de 80 | não |
| U4 | `ped***` | 15/09 12:18 | — | 0 | 0 | 0 | 0 | — | 0 | 80 de 80 | não |
| U5 | `stu***` | 15/09 13:34 | 14:28 (54 min) | 3 | 3 | 0 | 1 | 15/09 15:46 | 0 | 20 de 80 | não |
| U6 | `pis***` | 15/09 18:03 | — | 0 | 0 | 0 | 0 | — | 0 | 80 de 80 | não |
| U7 | `ete***` | 15/09 22:19 | 22:24 (5 min) | 2 | 2 | 0 | 1 | 15/09 22:26 | 0 | 40 de 80 | não |
| U8 | `ete***` | 15/09 22:35 | 22:39 (4 min) | 2 | 2 | 0 | 1 | 15/09 22:46 | 0 | 40 de 80 | não |

**Medido de verdade (tabelas de produto, não eventos):**

- **6 de 8 geraram**, quase sempre em menos de 6 minutos depois do cadastro.
  A ativação é rápida — o produto entrega na primeira sessão.
- **17 gerações, 17 concluídas, 0 falhas.** Ninguém parou por erro técnico.
- **Retorno: praticamente nenhum.** Só U1 voltou (14/09 17:59 → 15/09 00:21,
  intervalo de 6h22 — sessão nova, ainda dentro das primeiras 24h). Os outros
  7 nunca reabriram depois da sessão de cadastro.
- **Zero checkouts.** `checkout_started` É instrumentado (22 eventos na base,
  o último em 15/09), então aqui a ausência é real, não cegueira.
- U1 é o único perto do fim do saldo grátis: **2 nodes de 80**.
- O tour de boas-vindas aparece concluído para os 8, inclusive para quem não
  gerou nada — não serve para separar ninguém.

**Não medido — ausência de instrumentação, não de comportamento:**

| O que foi pedido | Situação |
|---|---|
| Downloads | **Não instrumentado.** `result_downloaded` não existe na base. Não dá para dizer se baixaram. |
| Visita à página de planos | **Não instrumentado.** `plans_viewed` não existe na base. |
| Primeira geração como evento | **Não instrumentado.** `first_generation` não existe; os números acima vêm de `renders`/`vistas`. |

Os únicos `event_type` presentes na base são `lp_view`, `lp_cta_click`,
`signup`, `checkout_started`, `subscription_started`, `subscription_renewed` e
`subscription_canceled`. As fases 4 e 5 do plano de analytics (eventos de
produto) nunca foram implantadas.

### Duas contas a confirmar antes de tratar como lead

- **U6 (`pis***`)**: criada 12 minutos depois do deploy da #211, sem nenhuma
  geração, saldo intocado. Tem cara de conta de verificação do próprio dono —
  se for, é caso de `mark_internal_actor`, e a amostra real cai para 7.
- **U7 e U8 (`ete***`)**: entraram pela mesma LP paga com 16 minutos de
  diferença; e-mails diferentes, mas com o mesmo prefixo, o mesmo sufixo e
  distância de edição 4 em 17 caracteres. Pode ser a mesma pessoa criando uma
  segunda conta. Conferir antes de contar como dois leads.

### O que NÃO dá para concluir

A amostra é de 8 contas, 7 delas com menos de 24 horas de vida, num período em
que o preço passou a aparecer na LP (PR #214) — mudança que, por previsão
registrada, derruba volume de cadastro e sobe qualidade. **Zero assinaturas em
8 cadastros não sustenta afirmação sobre conversão para pago.** O que os dados
sustentam é mais modesto e mais útil: a ativação funciona (6/8 em minutos, sem
falha) e o retorno ao segundo dia é o ponto fraco visível.

---

## 4. Abordagens preparadas (nenhuma mensagem enviada)

Canal: **e-mail**. Nenhum dos 8 tem WhatsApp cadastrado nem consentimento
(`whatsapp_consent_at` nulo nos 8), então WhatsApp está fora por falta de base
legal. Tudo abaixo é rascunho para revisão — conforme a regra da casa, o dono
lê e aprova cada mensagem antes de qualquer envio.

### Grupo A — geraram (U1, U2, U3, U5, U7, U8)

O gancho é o resultado que a pessoa já fez, não o produto. Todas as gerações
concluíram, então não há problema a consertar: o objetivo é **trazer de volta
para a segunda sessão**, que é onde este grupo some.

- **Momento:** 48–72 h depois da última geração.
- **Conteúdo:** o próprio render que a pessoa gerou + um próximo passo
  concreto do que ela já fez (quem gerou 2 imagens da mesma cena: variação de
  iluminação; quem criou Space: as outras vistas do mesmo ambiente).
- **Sem preço.** O grupo mal usou o saldo grátis — falar de plano agora é
  cobrar por algo que a pessoa ainda não precisa.
- **Exceção — U1:** gerou 5 vezes, criou Space, voltou numa segunda sessão e
  está com **2 nodes de 80**. É o único com pergunta de plano natural, e a
  conversa começa pelo limite que ele já encostou, não por desconto.

### Grupo B — não geraram (U4 e, se confirmado externo, U6)

**U4 é o caso que importa:** veio de campanha paga (o evento de signup tem
marcador de campanha), criou conta, abriu o `/app` — o evento de signup só é
gravado de dentro do app autenticado, então sabemos que entrou — e saiu sem
gerar, com os 80 nodes intactos.

- **Momento:** 24 h depois do cadastro (janela curta: intenção paga esfria).
- **Conteúdo:** uma pergunta única e específica — *o que te fez parar na
  primeira tela?* — e a oferta de fazer a primeira imagem com um arquivo dele.
  Sem tutorial genérico, sem "veja nossos recursos".
- **Valor do retorno é diagnóstico:** com 0 falhas técnicas na base inteira, a
  parada de U4 provavelmente não é bug, e sim primeira tela ou falta de
  arquivo à mão. A resposta dele vale mais que a conversão dele.
- **U6:** não abordar até confirmar se é conta interna.

### O que não fazer agora

Campanha de reativação em massa para os 8. São 7 contas com menos de 24 h de
vida — a maioria ainda está dentro da janela em que um retorno espontâneo é
plausível. Mandar e-mail para todo mundo hoje queima a lista e contamina a
leitura do próprio teste.

---

## 5. Consultas de conferência

```sql
-- Cadastros por dia (SEMPRE por auth.users.created_at)
select to_char(created_at at time zone 'America/Sao_Paulo','YYYY-MM-DD') as dia,
       count(*) as cadastros
from auth.users
where created_at >= now() - interval '30 days'
group by 1 order by 1 desc;

-- Cobertura do evento de signup
select count(*) as contas,
       count(*) filter (where exists (
         select 1 from marketing.acquisition_events e
          where e.user_id = u.id and e.event_type = 'signup')) as com_evento
from auth.users u;

-- Funil por origem, já sem tráfego interno (pós-migration)
select origin, count(*)
from marketing.acquisition_events
where event_type = 'signup' and is_internal = false
  and occurred_at >= now() - interval '30 days'
group by 1 order by 2 desc;
```
