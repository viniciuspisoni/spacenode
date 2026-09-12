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

Legenda: ✅ confirmado · ❓ não confirmado · ❌ negado

| autor(a) | grafia oficial | pares | landing | orgânico | mídia paga | evidência |
|---|---|---|---|---|---|---|
| muda arquitetura | **`muda arquitetura`** (minúsculo — é a marca) | cozinha-ceramica, hall-entrada | ✅ | ❓ | ❓ | aceite registrado em `components/landing/Projects.tsx` (main, 2026-09-09) |
| Paula Miolla | `Paula Miolla` | sala-jantar | ✅ | ❓ | ❓ | idem |
| Nathalia Costa | `Nathalia Costa` | cozinha-ilha, home-office | ✅ | ❓ | ❓ | idem |
| Bruna Plentz | `Bruna Plentz` | living-jantar | ✅ | ❓ | ❓ | idem |

### O que está confirmado

Só a coluna **landing**. A fonte é o comentário do `Projects.tsx` em prod desde
2026-09-09: *"Cada par vem da conta de um escritório que usa a plataforma, com
aceite do autor"*, e o texto público da seção: *"Publicado com autorização de
quem projetou."*

### O que NÃO está confirmado

**Orgânico e mídia paga.** Em 2026-09-11 o dono relatou ter pedido a essas
quatro pessoas autorização para usar o conteúdo. O pedido existiu; o **escopo**
dele não está registrado em lugar nenhum — não se sabe se cobria Reel, se cobria
anúncio pago, nem se tinha prazo.

**Pendência:** confirmar por pessoa, e registrar aqui a data e onde ficou a
conversa. Enquanto a coluna estiver ❓, peça naquele canal não sai.

---

## Grafia do crédito

O crédito vai **exatamente como a pessoa assina**. `muda arquitetura` é
minúsculo de propósito — escrever "Muda Arquitetura" erra o nome do cliente.

A grafia oficial da tabela acima é a fonte. Se mudar, muda aqui primeiro.

---

## Ao acrescentar um par novo

Os 6 pares atuais foram triados sobre 16 candidatos do banco em 2026-09-09.
Qualquer par novo repete a mesma verificação, que já derrubou 2 de 8:

1. **A tabela `renders` reusa o mesmo `input_url` entre gerações diferentes** —
   input e output **não** são garantidamente o mesmo enquadramento.
2. **Conferir com as imagens INTEIRAS**, nunca pelo comparador: no split
   meio a meio, metades diferentes da mesma cena parecem discrepância mesmo
   quando o par está certo, e o inverso também engana.
3. Nomear `-base` (modelo) e `-render` (resultado). **Nunca** `antes`/`depois`:
   no acervo legado os pares `casa` e `comercial` estão trocados no disco.

---

## Onde os arquivos vivem

`public/proj-<slug>-base.jpg` e `public/proj-<slug>-render.jpg` — os mesmos
que a landing serve. Fonte única: não duplicar em `marketing/`, porque duas
cópias da mesma imagem é exatamente como par trocado nasce.
