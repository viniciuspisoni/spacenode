# Autorizações de uso de projeto de cliente

Registro de quem autorizou o quê. Existe porque a tese de conteúdo passou a ser
**projeto real de escritório real** em vez de imagem genérica, e porque
autorização que só vive numa conversa de DM não sobrevive à próxima peça.

**Regra:** nenhuma peça publica projeto de cliente sem uma linha aqui cobrindo
o canal daquela peça. Se o canal não estiver coberto, a peça não sai — pergunta-se
primeiro.

---

## Por que canal importa

Não são o mesmo pedido:

| canal | o que significa pra quem projetou |
|---|---|
| **Landing / site** | fica numa página que a pessoa pode visitar e conferir |
| **Orgânico** (Reel, post, stories) | vai pros seguidores do perfil, com alcance que decai em dias |
| **Mídia paga** (Meta, Google) | o trabalho dela é empurrado pra estranhos, por meses, com o nome dela junto, e pode ser recortado em variantes A/B |

Um "pode usar" dado pensando na landing **não cobre automaticamente anúncio pago**.

---

## Registro

Legenda: ✅ confirmado · ⚠️ liberado pelo dono, sem confirmação individual
registrada · ❓ não confirmado · ❌ negado

| autor(a) | grafia oficial | pares | landing | orgânico | mídia paga | evidência |
|---|---|---|---|---|---|---|
| muda arquitetura | **`muda arquitetura`** (minúsculo — é a marca) | cozinha-ceramica, living-estante, entrada-corredor, sala-estar | ✅ | ❓ | ⚠️ | aceite registrado em `components/landing/Projects.tsx` (main, 2026-09-09) para cozinha-ceramica; lote novo entregue pelo dono em 2026-09-16 com landing ✅ para os três (ver ressalva abaixo); mídia paga liberada pelo dono em 2026-09-16 (ver ressalva abaixo) |
| Paula Miolla | `Paula Miolla` | sala-jantar | ✅ | ❓ | ⚠️ | idem |
| Nathalia Costa | `Nathalia Costa` | cozinha-ilha, home-office | ✅ | ❓ | ⚠️ | idem |
| Bruna Plentz | `Bruna Plentz` | living-jantar | ✅ | ❓ | ⚠️ | idem |

> **`hall-entrada` saiu da landing em 2026-09-16** (decisão do dono, PR #213).
> Os arquivos `public/proj-hall-entrada-*.jpg` foram apagados e entraram três
> pares novos da muda arquitetura. A autorização dela não mudou — só esse par
> saiu de cena.

> **A linha "Rafa" foi absorvida pela muda arquitetura.** Em 2026-09-15 o par
> `rafa-estante` do Reel foi creditado a `Rafa` em caráter provisório, porque a
> pasta de origem (`193_rafa`) tem nome de cliente e ninguém tinha conferido de
> quem era o projeto. Em 2026-09-16 o dono confirmou: **`193_rafa` é projeto da
> muda arquitetura** — `Rafa` é o cliente, não quem assina. O crédito do Reel
> antes/depois "estante" precisa ser corrigido antes de publicar.
>
> Fica a lição: **nome de pasta do lote não é crédito.** `164_suellen`,
> `176_maite e luis` e `193_rafa` são todos da mesma autora.

### O que está confirmado

Só a coluna **landing**. A fonte é o comentário do `Projects.tsx` em prod desde
2026-09-09: *"Cada par vem da conta de um escritório que usa a plataforma, com
aceite do autor"*, e o texto público da seção: *"Publicado com autorização de
quem projetou."*

### O que NÃO está confirmado

**Orgânico.** Em 2026-09-11 o dono relatou ter pedido a essas quatro pessoas
autorização para usar o conteúdo. O pedido existiu; o **escopo** dele não está
registrado em lugar nenhum — não se sabe se cobria Reel, se cobria anúncio pago,
nem se tinha prazo.

**Pendência:** confirmar por pessoa, e registrar aqui a data e onde ficou a
conversa. Enquanto a coluna estiver ❓, peça naquele canal não sai.

### Mídia paga — ⚠️ liberado pelo dono, sem confirmação individual (2026-09-16)

Em 2026-09-16 o dono decidiu usar os pares `proj-*` na LP de campanha
`/lp/print-do-sketchup`, destino do tráfego pago do Meta. A decisão foi tomada
depois de a pendência acima ser apresentada a ele, então é escolha informada —
mas **continua sem registro de conversa com cada autor(a)** cobrindo esse canal.

Por que o ⚠️ não vira ✅ sozinho: mídia paga empurra o trabalho da pessoa para
estranhos, por meses, com o nome dela junto. Um "pode usar" dado pensando na
landing é um pedido diferente. As quatro ainda não disseram sim para este.

**O que fecha isso:** falar com muda arquitetura, Paula Miolla, Nathalia Costa e
Bruna Plentz, dizer que o projeto delas vai aparecer creditado em anúncio pago,
e registrar aqui a data e onde ficou a conversa. Se alguma recusar, o par sai da
LP — é remover uma entrada do array `before_after` na linha de
`marketing.landing_pages`, sem deploy.

---

## Grafia do crédito

O crédito vai **exatamente como a pessoa assina**. `muda arquitetura` é
minúsculo de propósito — escrever "Muda Arquitetura" erra o nome do cliente.

A grafia oficial da tabela acima é a fonte. Se mudar, muda aqui primeiro.

---

## Ao acrescentar um par novo

Os 8 pares atuais foram triados sobre 16 candidatos do banco (2026-09-09) mais
6 de um lote entregue pelo dono (2026-09-16). Qualquer par novo repete a mesma
verificação, que já derrubou 2 de 8:

1. **A tabela `renders` reusa o mesmo `input_url` entre gerações diferentes** —
   input e output **não** são garantidamente o mesmo enquadramento.
2. **Conferir com as imagens INTEIRAS**, nunca pelo comparador: no split
   meio a meio, metades diferentes da mesma cena parecem discrepância mesmo
   quando o par está certo, e o inverso também engana.
3. Nomear `-base` (modelo) e `-render` (resultado). **Nunca** `antes`/`depois`:
   no acervo legado os pares `casa` e `comercial` estão trocados no disco.
4. **Em lote vindo do Drive, o nome do arquivo não diz qual é qual.** O sufixo
   `(1)` da desduplicação cai ora na base, ora no render — no lote de
   2026-09-16 ele caiu nos dois lados dentro da *mesma* pasta. O que separa é
   a dimensão: print do SketchUp sai maior (3000x1619 / 3500x1969) que o
   render da plataforma (2816x1504 / 2731x1536). Confirmar olhando.
5. **Cortar os dois lados na mesma proporção** antes de entrar em `public/`.
   A base e o render saem em ratios levemente diferentes; com `object-fit:
   cover` numa célula 16/9 cada lado é cortado de um jeito e o comparador
   desliza alguns pixels no meio da cena.
6. **Nome de pasta do lote não é crédito.** `164_suellen`, `176_maite e luis`,
   `193_rafa` são nomes de *cliente*; os três são projeto da mesma autora.
   Perguntar ao dono quem assina antes de escrever o crédito.

---

## Onde os arquivos vivem

`public/proj-<slug>-base.jpg` e `public/proj-<slug>-render.jpg` — os mesmos
que a landing serve. Fonte única: não duplicar em `marketing/`, porque duas
cópias da mesma imagem é exatamente como par trocado nasce.
