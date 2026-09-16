# LP de campanha: de cadastro para assinatura

Decisão de 2026-09-16, depois de o dono ver um anúncio próprio no celular e
encontrar a landing quebrada.

---

## 1. O que o número diz

| origem | cadastros | assinaturas |
|---|---|---|
| Google Ads (24–31/07) | 62 | **0** |
| Meta (R$ 468, set/26) | — | **0** |
| Orgânico | — | **7% assinam** |

Ativação é alta (89%): quem se cadastra usa. O funil não morre na landing nem
no produto — morre entre o cadastro e a assinatura, e **só no tráfego pago**.

A leitura honesta: a LP estava otimizada para a métrica errada. Ela prometia
"80 nodes grátis, sem cartão" e entregava exatamente isso — cadastro grátis.
Não havia, em nenhum ponto da página, a informação de que a ferramenta é paga.

## 2. A tese

**Preço na LP filtra antes do clique, não depois.**

Quem clica num anúncio e lê "grátis, sem cartão" se cadastra como quem pega uma
amostra. Quem lê "R$ 99/mês, e dá para testar com 80 nodes antes" se cadastra
como quem está avaliando uma compra. São duas populações diferentes chegando
pelo mesmo anúncio.

A previsão que decorre disso, e que torna a tese falseável:

- **cadastros por real gasto vai CAIR** — é o efeito pretendido, não uma falha;
- **assinaturas por real gasto precisa SUBIR** — se não subir em 14 dias de
  entrega, a tese está errada e a página volta atrás.

> Não comparar a LP nova com a antiga por volume de cadastro. É a comparação
> que faz a página errada parecer a certa. Ver o precedente do R$ 0,15/visita
> de julho, que virou benchmark de uma métrica diferente e contaminou três
> leituras seguidas.

## 3. O que mudou na página

| antes | depois | por quê |
|---|---|---|
| sem preço em lugar nenhum | seção `pricing` com Essence / Pro / Studio | a decisão de assinar precisa da informação de preço |
| FAQ: "a partir de R$ 89/mês, 750 nodes" | preço lido de `SELLABLE_PLANS` | o Starter saiu da vitrine em 12/09; o dado congelou o preço antigo |
| 3 pares antes/depois em 404 | 3 pares `proj-*` reais, creditados | não existe par `gallery-*` completo em `public/` |
| depoimento "— cliente SpaceNode" | removido | autoria não verificável não é prova social |
| `modules` (4 módulos) | removido | tira o foco da decisão; a LP não é tour de produto |
| FAQ operacional (o que são nodes) | FAQ de objeção de assinatura | acúmulo de nodes, cancelamento, 90 dias de saldo |

O casamento de mensagem com o criativo foi **preservado de propósito**: o hero
continua falando de print do SketchUp e antes/depois, que é o que o anúncio
promete. A moldura de assinatura entra depois da prova, não antes dela.

## 4. O que medir

Já existe o necessário: `marketing.acquisition_events` grava `lp_view` e
`lp_cta_click` por slug, e o `sn_attribution` carrega a UTM até o signup.

```
lp_view → lp_cta_click → signup → assinatura
```

Os dois primeiros só existem nas LPs `/lp/<slug>` — a landing principal e a
`/sketchup` não emitem `lp_view`. Se algum teste mandar tráfego pago para a
home, esse teste nasce cego.

## 5. O que esta página NÃO resolve

Ela mexe no topo. Se a causa real do 0/62 estiver embaixo — 80 nodes grátis
sendo suficientes para a necessidade pontual de quem chega por anúncio, ou a
ausência de um momento em que o produto peça a assinatura — uma LP melhor
produz cadastro mais qualificado e ainda assim pouca assinatura.

O levantamento do degrau cadastro→assinatura ficou pendente por decisão do
dono em 2026-09-16 (a escolha foi desenhar a LP primeiro). As pistas que já
existem, para quando ele for feito:

- **o anual está desligado** (`ANNUAL_BILLING_ENABLED = false`, bug de recarga
  mensal). A análise de planos de 10/09 concluiu que a alavanca real é o anual,
  não feature — e ele continua fora do ar;
- **white-label é o único gate por plano em todo o código**, e não era vendido
  até a PR #198. Não há degrau funcional entre grátis e pago além de volume;
- **80 nodes = 8 renders HD.** Para quem chega por anúncio com uma reunião
  marcada, 8 pode ser exatamente o suficiente.
