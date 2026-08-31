# SPACENODE — Formatos de conteúdo

> Catálogo de formatos do sistema editorial. O campo `format` de `marketing.content_briefs` usa o
> slug da primeira coluna. Especificações de copy (limites de caracteres) em
> [`editorial-guidelines.md`](./editorial-guidelines.md); regras visuais em
> [`visual-guidelines.md`](./visual-guidelines.md). Proporções seguem os templates HTML de
> `content-factory/templates/`.

| Slug | Formato | Proporção | Uso |
|---|---|---|---|
| `post_estatico` | Post estático | 1080×1080 ou 1080×1350 | Argumento único, prova visual |
| `antes_depois` | Comparativo antes e depois | 1080×1080 / 1080×1350 | Device visual da marca |
| `carrossel_educativo` | Carrossel educativo | 5× 1080×1350 | Ensino com critério técnico |
| `carrossel_estudo_caso` | Carrossel de estudo de caso | 5× 1080×1350 | Prova social real |
| `tres_angulos` | Três ângulos do mesmo projeto | 3–5× 1080×1350 | Coerência entre vistas |
| `tutorial_carrossel` | Tutorial em carrossel | 5× 1080×1350 | Passo a passo objetivo |
| `reel_demonstrativo` | Reel demonstrativo | 1080×1920, 15–30s | Fluxo real na tela |
| `reel_produto` | Reel de produto | 1080×1920, 15–30s | Um módulo, um problema |
| `video_anuncio` | Vídeo curto para anúncio | 1080×1920 / 1080×1080, ≤15s | Mídia paga (futuro) |
| `story` | Story | 1080×1920 | Reaproveitamento e presença |
| `lancamento` | Conteúdo de lançamento | variável | Novidade ativa em produção |
| `prova_social` | Conteúdo de prova social | variável | Caso/repost autorizado |
| `remarketing` | Conteúdo para remarketing | 1080×1080 / 1080×1920 | Mídia paga (futuro) |

---

## Especificação por formato

### `post_estatico` — Post estático
- **Estrutura:** eyebrow (opcional) + headline ≤8 palavras + linha de apoio ≤2 linhas (~90
  caracteres) + imagem real como protagonista.
- **Direção:** um ponto focal; a arquitetura é o elemento principal; verde só funcional (<5%).
- **Pilares típicos:** fidelidade-geometrica, bastidores, novidades, educativo-apresentacao.

### `antes_depois` — Comparativo antes e depois
- **Estrutura:** split vertical/horizontal ou sequência de 2 slides; labels sóbrios
  ("modelo" / "render"); opcional overlay de linhas de fuga (traço fino, branco ou verde
  funcional).
- **Regra de honestidade:** mesmo projeto, insumo real → resultado real da plataforma. Sem
  maquiagem do "antes".
- **Pilares típicos:** antes-e-depois, fidelidade-geometrica, tradicional-vs-spacenode.

### `carrossel_educativo` — Carrossel educativo
- **Estrutura:** 5 slides — gancho / 3 argumentos (um por slide) / fechamento + CTA. Título de
  slide ≤7 palavras; corpo ≤220 caracteres.
- **Direção:** denso de valor, visual limpo; numerar os slides discretamente.
- **Pilares típicos:** erros-comuns, educativo-apresentacao, criterio técnico em geral.

### `carrossel_estudo_caso` — Carrossel de estudo de caso
- **Estrutura:** contexto do projeto → desafio → processo (telas reais) → resultado → crédito ao
  arquiteto + CTA.
- **Pré-requisito:** `content_projects.permission_status = granted` e crédito acordado.
- **Pilares típicos:** estudos-de-caso.

### `tres_angulos` — Três ângulos do mesmo projeto
- **Estrutura:** 3–5 vistas do mesmo ambiente (Spaces), 1 vista por slide, materiais e luz
  coerentes; slide final com CTA.
- **Direção:** ordenar como uma visita ao ambiente (entrada → detalhe → geral).
- **Pilares típicos:** coerencia-entre-angulos, antes-e-depois.

### `tutorial_carrossel` — Tutorial em carrossel
- **Estrutura:** gancho ("do print à imagem em N passos") → 1 passo por slide com tela real →
  resultado final + CTA "Comece grátis".
- **Regra:** só fluxo ativo em produção; passos reais, sem atalho escondido.
- **Pilares típicos:** tutoriais-rapidos.

### `reel_demonstrativo` — Reel demonstrativo
- **Estrutura:** gancho visual ≤3s (resultado ou tela) → screen capture real do fluxo (pode
  acelerar, declarando) → resultado → CTA único. 15–30s.
- **Direção:** tempo real na tela quando o argumento é prazo; texto em tela mínimo.
- **Pilares típicos:** produtividade, antes-e-depois, tutoriais-rapidos.

### `reel_produto` — Reel de produto
- **Estrutura:** um módulo, um problema, uma tela: problema (2–3s) → uso real do módulo →
  resultado → CTA. 15–30s.
- **Pilares típicos:** demonstracao-de-ferramentas, novidades.

### `video_anuncio` — Vídeo curto para anúncio *(estrutura preparada; mídia paga fora deste sprint)*
- **Estrutura:** ≤15s, mensagem única, legenda embutida (som off), CTA no frame final.
- **Regra:** 3 variações de ângulo por peça (fidelidade / prazo / apresentação); botão `SIGN_UP`
  ou `LEARN_MORE`.
- **Pilares típicos:** antes-e-depois, produtividade.

### `story` — Story
- **Estrutura:** 1–3 telas; headline + 1 apoio + CTA. Reaproveita peça de feed com recorte novo.
- **Pilares típicos:** todos (canal de distribuição, não de tese).

### `lancamento` — Conteúdo de lançamento
- **Estrutura:** o que mudou → o problema que resolve → onde encontrar → CTA "Veja no seu próprio
  projeto". Pode combinar post + Reel + story da mesma novidade.
- **Regra:** só depois de ativo em produção para todos (conferir `lib/nav/modules-config.ts`).
- **Pilares típicos:** novidades.

### `prova_social` — Conteúdo de prova social
- **Estrutura:** repost comentado ou caso curto; sempre com autorização registrada e crédito.
- **Regra dura:** sem material real, não existe peça. Nunca inventar depoimento.
- **Pilares típicos:** estudos-de-caso.

### `remarketing` — Conteúdo para remarketing *(estrutura preparada; mídia paga fora deste sprint)*
- **Estrutura:** peça curta que responde a objeção de quem já visitou (fidelidade? preço? prazo?),
  1 objeção por peça.
- **Pilares típicos:** fidelidade-geometrica, produtividade, tradicional-vs-spacenode.
