# Fábrica de conteúdo SPACENODE

Sistema de geração de conteúdo para o Instagram **@spacenode** e para o **Meta Ads**.

> **Este sistema gera para revisão humana. Ele não publica.**
> Toda peça sai como rascunho em `output/` e só chega ao público depois de revisão manual (orgânico) ou de subir **pausada** no Gerenciador de Anúncios (pago). Não existe caminho automático entre gerar e publicar — por decisão de processo, não por limitação técnica.

Toda peça segue o contrato de marca definido em `brand-rules.md`. Em caso de conflito entre qualquer arquivo desta pasta e o `brand-rules.md`, vale o `brand-rules.md`.

---

## Mapa da pasta

| Caminho | Papel |
|---|---|
| `brand-rules.md` | **Fonte da verdade.** Identidade, voz, claims permitidos/proibidos, especificações de copy por formato, regras visuais, processo e o bloco "Parâmetros máquina" que o gerador lê para validar as peças. |
| `content-pillars.json` | Pilares editoriais: 6 pilares com objetivo, ângulos, formatos recomendados, CTA padrão, KPIs e o mix semanal sugerido. Cada peça pertence a exatamente um pilar. |
| `templates/` | Os 4 formatos de arte (quadrado 1080×1080, vertical 1080×1350, story/reels 1080×1920, carrossel 5×1080×1350) como HTML parametrizável, já no contrato visual da marca. |
| `generate.mjs` | O gerador. Recebe tema + pilar + campanha, produz copy, roteiro, variações de anúncio, briefing visual, previews HTML e o checklist de revisão. |
| `output/` | Peças geradas, organizadas por data e campanha. Nada aqui é final até passar pela revisão. |

---

## Quickstart

```bash
node content-factory/generate.mjs --tema "Linhas de fuga antes e depois do render" --pilar fidelidade-geometrica --campanha julho-organico
```

Flags:

| Flag | Valores | Default |
|---|---|---|
| `--formatos` | `quadrado,vertical,story,carrossel` (lista separada por vírgula) | todos |
| `--objetivo` | `organico` \| `trafego` \| `ambos` | `ambos` |
| `--offline` | gera sem chamar API (placeholders para teste do pipeline) | desligado |

O modo online usa o Gemini e exige `GEMINI_API_KEY` no `.env.local`. O `--offline` serve para testar templates e estrutura sem custo.

Os valores válidos de `--pilar` são os `id` de `content-pillars.json` (ex.: `fidelidade-geometrica`, `do-modelo-a-apresentacao`, `criterio-tecnico`).

---

## O que cada peça contém

Cada execução cria uma pasta em:

```
output/YYYY-MM-DD_campanha/NN-tema/
```

onde `NN` é um contador sequencial dentro da campanha e `tema` é o slug do tema. Dentro dela:

| Arquivo | Conteúdo |
|---|---|
| `copy.md` | Copy de feed: headline da arte, linha de apoio, legenda completa (gancho ≤125 caracteres, corpo, CTA, hashtags). |
| `reels.md` | Roteiro de Reels/Story: gancho visual nos 3 primeiros segundos, cena a cena, texto em tela, CTA único. |
| `anuncios.md` | 3 variações de anúncio Meta (ângulos diferentes), cada uma com texto primário, título ≤40 caracteres, descrição ≤30 caracteres e botão CTA válido (`SIGN_UP` ou `LEARN_MORE`). |
| `briefing-visual.md` | Direção de arte da peça: qual imagem/tela real usar, enquadramento, onde entra o antes/depois, uso do verde funcional. |
| `REVIEW.md` | Checklist de revisão humana: voz, claims, limites de caracteres, regras visuais. É o portão de saída — nada segue sem ele passar. |
| `previews/` | Um HTML por formato solicitado, renderizando a arte no contrato visual da marca. É daqui que sai o PNG final. |
| `peca.json` | Metadados estruturados da peça (tema, pilar, campanha, formatos, objetivo, status da validação automática). |

---

## Fluxo de trabalho

O processo é o do §6 do `brand-rules.md`, sem atalhos:

1. **Gerar** — rodar o `generate.mjs` com tema, pilar e campanha.
2. **Revisar** — abrir o `REVIEW.md` da peça e passar o checklist item a item: voz, claims (só recursos ativos em produção — conferir `lib/nav/modules-config.ts`), limites de caracteres, regras visuais.
3. **Ajustar** — editar copy e arte direto nos arquivos gerados até o checklist fechar.
4. **Exportar PNG** — abrir o HTML de `previews/` no navegador → DevTools → clique-direito no nó `.canvas` → "Capture node screenshot". Sai o PNG na resolução exata do formato.
5. **Publicar manualmente** — orgânico: postar no Instagram pelo fluxo normal. Pago: subir a campanha no Gerenciador de Anúncios com status **pausado**; a ativação é uma decisão humana, tomada fora deste sistema.

---

## Como evoluir o sistema

**Adicionar um pilar novo** — editar `content-pillars.json`: incluir um objeto em `pilares` com `id` (slug estável, usado no `--pilar`), `nome`, `participacao`, `objetivo`, `angulos`, `formatos_recomendados`, `exemplos_de_tema`, `cta_padrao` e `kpis`. Ajustar as `participacao` dos demais para o mix continuar somando 1 e, se fizer sentido, atualizar o `mix_semanal_sugerido`. Incrementar `versao` e `atualizado_em`.

**Evoluir regras de marca** — editar `brand-rules.md`. Atenção: o bloco **"Parâmetros máquina"** (§7) é lido pelo `generate.mjs` para validação automática — léxico proibido, limites de caracteres e CTAs válidos. Toda mudança nas seções 2 (voz) ou 4 (copy) que afete esses valores precisa ser replicada no bloco JSON, senão o gerador valida contra regras defasadas.

---

## Relação com `lib/meta/ads.ts`

A integração com a Graph API do Meta (`lib/meta/ads.ts`) existe para **leitura** de contas e campanhas e para **futura automação de gestão de campanha** (ex.: criação de campanhas de tráfego pausadas). Ela não publica conteúdo e não vai publicar: a publicação continua manual por decisão de processo — o custo de uma peça errada no ar é maior que o ganho de automatizar o último passo.
