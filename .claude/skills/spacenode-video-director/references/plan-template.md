# SPACENODE VIDEO PLAN — formato de saída

Toda peça começa aqui. O plano é entregue **antes** de qualquer geração paga e
termina sempre com o pedido de aprovação.

Cabeçalhos em inglês (é o contrato combinado), conteúdo em português.

> **Este arquivo é o que o dono lê. O `plan.json` é o que as ferramentas leem.**
> Escreva o `plan.json` primeiro (`references/plan-schema.md`), rode o
> `plan-lint` e o `estimate-cost --plan`, e **gere esta prosa a partir dele** —
> nunca o contrário, senão os dois divergem e o custo apresentado deixa de ser o
> custo real. O `ESTIMATED COST` e o hash vêm do script, colados.

---

## Template

```
SPACENODE VIDEO PLAN

OBJECTIVE
<o que esta peça tem que conseguir, em uma frase. Orgânico ou pago.>

FORMAT
9:16 — 1080x1920 — 30fps — H.264

DURATION
12s

AUDIENCE
<quem, em que estágio de consciência, e o que ele já acredita>

CONCEPT
<a ideia em uma frase. Se precisar de duas, ainda não está pronta.>

HOOK
<as palavras exatas dos primeiros 2 segundos, ou a imagem exata se for visual>

STORYBOARD

SHOT 01
0,0–1,5s
Source:         <caminho real do asset>
Camera:         <movimento + ficha>
Model:          <endpoint | "reel-kit (sem IA)">
Prompt concept: <a ideia do prompt, não o prompt final>
Text:           <o card, ou "—">

SHOT 02
1,5–4,0s
...

SHOT 03
...

MOTION DESIGN
<como o texto entra e sai; transições; o que se move e o que fica parado>

SOUND DESIGN
<camadas e tempos — ou "sem áudio (entra no app do Instagram)">

CTA
<a frase exata do card final>

AI MODELS
<endpoint por shot, com uma linha de justificativa cada>

ESTIMATED COST
US$ X,XX   (N chamadas pagas, --takes 2, preços consultados em <data>)
<avisos do estimador, se houver>

A/B OPTIONS
<as variantes propostas, dizendo qual dimensão muda em cada uma>

READY FOR GENERATION
Awaiting approval.
```

---

## Regras do plano

1. **Nenhum `Source:` inventado.** Se o caminho não existe no disco, o shot não
   está pronto. Diga isso no plano em vez de escrever um caminho plausível.
2. **`Model:` explícito em todo shot**, inclusive `reel-kit (sem IA)`. É assim que
   o custo fica auditável.
3. **`ESTIMATED COST` vem do script**, não da cabeça. Cole o total real de
   `scripts/estimate-cost.mjs`, com a data da consulta.
4. **A soma das durações** dos shots tem que bater com `DURATION`.
5. Se um shot for opcional (o caso mais comum: o único shot pago da peça), marque
   como `[opcional]` e mostre o custo com e sem ele. Muitas vezes o dono escolhe
   a versão de US$ 0,00.
6. O plano termina **exatamente** com as duas linhas de `READY FOR GENERATION`.
   Sem texto depois. Sem "vou começar".

## Quando o plano muda depois de aprovado

Se a execução exigir um modelo diferente, mais um take, ou resolução maior, isso
é **novo custo**: volte ao portão. Um "pode gerar" aprovou aquele plano, não
qualquer plano.
