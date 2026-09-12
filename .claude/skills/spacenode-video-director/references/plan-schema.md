# plan.json — o contrato executável

O `SPACENODE VIDEO PLAN` (prosa, em `plan-template.md`) é o que o **dono lê**.
O `plan.json` é o que as **ferramentas leem**. Os dois descrevem a mesma peça, e
a prosa é gerada a partir do JSON — nunca o contrário, senão eles divergem.

**O plano é a fonte única.** Estimativa, aprovação, geração e entrega leem todos
o mesmo arquivo. Não existe redigitar shot list em linha de comando.

Vive em `marketing/specs/AAAA-MM-DD-<slug>/plan.json` e **é versionado** (ao
contrário do mp4, que é regenerável e está no `.gitignore`).

---

## 1. O fluxo inteiro

```
1. escreve plan.json
2. node scripts/plan-lint.mjs <plano>                      grátis · valida
3. node scripts/estimate-cost.mjs --plan <plano> --brl 5.40 grátis · preço ao vivo + HASH
4. apresenta o SPACENODE VIDEO PLAN + custo ao dono         ←── PARADA OBRIGATÓRIA
5. node scripts/run-plan.mjs <plano> --approve <hash>       grátis · dry-run, imprime os comandos
6. node scripts/run-plan.mjs <plano> --approve <hash> --execute   PAGO
7. node scripts/qa-frames.mjs takes/<take>.mp4              grátis · extrai frames → Read
8. monta (reel-kit / cinema-kit / remotion)                 grátis
9. node scripts/deliver.mjs <plano>                         grátis · QA.md + caption.txt
```

Os passos 2, 3, 5, 7 e 9 não custam nada. **Só o 6 gasta.**

---

## 2. Campos

### Topo

| campo | obrigatório | o que é |
|---|---|---|
| `slug` | sim | `AAAA-MM-DD-nome-em-kebab`. Vira o nome da pasta de entrega. |
| `kind` | recomendado | `"organic"` ou `"paid"`. `paid` liga as regras de hook e CTA. |
| `objective` | sim | O que a peça tem que conseguir, em uma frase. |
| `concept` | sim | A ideia em uma frase. Se precisar de duas, não está pronta. |
| `audience` | — | Quem, em que estágio de consciência. |
| `hook` | obrigatório se `paid` | As palavras exatas dos primeiros 2s. |
| `cta` | — | A frase exata do card final. |
| `duration` | sim | Segundos. **Tem que bater com a soma dos shots.** |
| `takes` | — | Tentativas por shot pago. Default 2 — nunca estime com 1. |
| `format` | sim | `{ aspect, width, height, fps }`. |
| `shots` | sim | Array, em ordem cronológica. |
| `assembly` | recomendado | `{ kit: "reel-kit" \| "cinema-kit" \| "remotion", spec }`. |
| `motion_design`, `sound_design`, `notes` | — | Prosa, não afeta custo nem hash. |

### Shot

| campo | obrigatório | o que é |
|---|---|---|
| `id` | sim | Único no plano. Vira o nome do arquivo do take. |
| `start`, `end` | sim | Segundos. **Contíguos** — o `start` de um é o `end` do anterior. |
| `source` | quase sempre | Caminho real. Aceita `$REPO` e `$ACERVO`. **Conferido no disco.** |
| `model` | **sempre** | `"reel-kit"`, `"card"` ou o `endpoint_id`. Inclusive nos grátis — é assim que o custo fica auditável. |
| `generate` | só se `model` for endpoint | O bloco pago. Ver abaixo. |
| `camera`, `text` | — | Direção e o card. |

### Bloco `generate`

| campo | o que é |
|---|---|
| `endpoint` | Tem que ser idêntico ao `model` do shot. |
| `inputs` | Os parâmetros **exatos** do schema do endpoint. `"@source"` é substituído pelo URL do upload do `source`. |
| `seconds` | **O que você PAGA.** Tem que bater com `inputs.duration`. |
| `res`, `aspect`, `fps` | Base de cálculo pra endpoints cobrados por token. |
| `images` | Pra endpoints cobrados por imagem. |
| `count`, `takes` | Chamadas e tentativas deste shot. |

**`seconds` não é a duração do shot na timeline.** Você pode gerar 5s e usar 4s,
aparando na montagem. `seconds` é o que a fal cobra. O linter reprova se
`seconds` divergir de `inputs.duration`, porque aí a estimativa mentiria — e
reprova se `seconds` for *menor* que o espaço do shot na timeline, porque aí o
take não preenche o corte.

---

## 3. O hash — LEI 2 em forma mecânica

`plan-lint` e `estimate-cost --plan` imprimem um hash. `run-plan` exige
`--approve <hash>` e recusa se não bater.

O hash cobre **só o material de geração**: endpoint, inputs, seconds, res,
aspect, fps, images, count, takes. Consequência deliberada:

- corrigir `objective`, `caption`, `motion_design` → **hash igual**, aprovação vale;
- mexer em prompt, endpoint, duração, resolução ou takes → **hash muda**, aprovação morre.

É a forma executável de *"um 'pode gerar' aprovou aquele plano, não qualquer plano."*

---

## 4. As travas do `run-plan`

1. **Plano inválido** → recusa antes de qualquer coisa.
2. **Sem `--approve`** → recusa e imprime o hash atual.
3. **Hash divergente** → recusa e mostra os dois lados.
4. **Sem `--execute`** → dry-run: imprime o comando exato de cada chamada, não envia nada.
5. **Teto de 1,2× a estimativa** → para no meio da execução e grava o ledger.

O dry-run existe pra você conferir cada linha contra `genmedia schema` antes de
gastar: **um 422 por campo errado é cobrado; um 5xx não é.**

---

## 5. O ledger

`run-plan --execute` grava `ledger.json` ao lado do plano, com uma entrada por
chamada: shot, take, endpoint, `request_id`, status, arquivos baixados e custo.

A entrada é escrita **antes** da chamada sair, para que um crash deixe rastro.

**O custo do ledger é computado**, com o preço vigente no momento da chamada —
é a mesma conta do estimador aplicada ao que rodou. **Não é a fatura da fal.**
Para gasto real, o dono confere no painel da fal.

---

## 6. Quando não existe shot pago

É o caso mais comum e o melhor. Peça inteira em `reel-kit` + captura real:
`estimate-cost --plan` devolve **US$ 0,00**, `run-plan` diz que não há nada a
gerar, e você vai direto pra montagem. A maior economia da SpaceNode é perceber
que a maioria dos shots não precisa de modelo nenhum.

---

## 7. Exemplo

`templates/plan.example.json` — 12s, 4 shots, 1 pago. Passa no linter.
Use como ponto de partida: copie, troque o slug e os sources.
