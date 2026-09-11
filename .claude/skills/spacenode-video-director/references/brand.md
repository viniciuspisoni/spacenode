# Identidade visual SpaceNode em movimento

Fonte de verdade em código: `components/brand/Logo.tsx`,
`components/brand/ConstellationN.tsx`, tokens em `app/globals.css`.
Fonte de verdade editorial: `marketing/BRIEF.md`.
Este arquivo traduz as duas para **vídeo**.

---

## 1. A estética em uma frase

Premium · minimal · arquitetônico · tecnológico · cinematográfico ·
contemporâneo · sofisticado.

Referência de **nível de refinamento** (nunca de cópia): filmes de produto da
Apple, filmes de arquitetura de alto padrão, cinematografia de imóveis de luxo,
campanhas de tecnologia minimalistas, design editorial premium.

O teste: *se esta peça aparecesse sem logo, alguém diria que é de uma empresa
séria de arquitetura ou de uma ferramenta de IA barata?*

## 2. Tokens

| Token | Valor | Uso |
|---|---|---|
| Fundo escuro | `#0A0A0A` | padrão de Reel e film |
| Card escuro | `#1A1A1A` | faixa sólida de card (mesma da landing) |
| Fundo claro | `#FAFAFA` | tema light de card (`"theme": "light"`) |
| Texto sobre escuro | `#FFFFFF` | hook, statement |
| Texto terciário | `#9A9AA0` | trecho entre `[colchetes]` no reel-kit |
| Verde accent | `#30D158` (dark) / `#30B46C` (light) | **uma** palavra por card, no máximo |
| Tipografia | Geist SemiBold (título) / Regular (corpo) | `marketing/brand/*.woff2` |
| Logo | ConstellationN, 100% monocromático branco | `marketing/brand/*.svg` |

**Sobre o verde:** é funcional, não decorativo. Marca o número, o CTA ou a
palavra-chave. A partir de set/26 a linguagem da landing em vidro usa o **branco
opaco** como accent nas seções de preço — quando a peça citar planos/preço, não
puxe verde. `accent: false` no topo do spec neutraliza o verde da peça inteira
(a rodada orgânica de 05/09 saiu inteira sem verde, a pedido do dono).

**Linguagem atual (set/26):** o app e a landing estão em material de vidro
Apple — superfícies translúcidas, blur, borda de 1px clara, sem gradiente
chamativo. Peças que mostram UI devem parecer com isso, não com o app antigo.

## 3. Proibido

Não porque é feio em abstrato — porque não é a SpaceNode:

- estética genérica de vídeo de IA (aquele brilho plástico saturado)
- excesso de efeito · transição de TikTok genérica · zoom exagerado
- glitch, neon cyberpunk, partícula aleatória, lens flare
- câmera impossível (drone dentro de sala, órbita 360° em interior)
- motion design exagerado, elemento entrando de 4 direções diferentes
- cara de template barato, cara de PowerPoint
- texto demais na tela
- clichê de startup ("revolucione", "descomplique", "game changer")
- emoji dentro da arte (emoji só em legenda)
- sombra pesada, gradiente chamativo, mais de uma cor de destaque

## 4. Tipografia em movimento

- **Uma ideia por tela.** Se a frase precisa de vírgula e "mas", vira dois cards.
- Hook: ≤ 8 palavras. Sub: ≤ 12.
- Minúsculas com ponto final no fecho ("três passos. do estudo à apresentação.").
- `eyebrow` em uppercase, `letter-spacing 0.22em`, fios de 0,5px dos dois lados —
  é o padrão da landing, já implementado no reel-kit.
- Entrada de texto: sutil, precisa, intencional. Nunca bounce, nunca rotação,
  nunca letra por letra em peça de arquitetura. Fade + 12–20px de translateY com
  easing de saída é suficiente.
- Texto **troca em corte**, imagem troca em wipe. Nunca deixe o wipe atravessar
  o texto (regra do BRIEF, já implementada como `overlays` global no reel-kit).

## 5. Zona segura (9:16, 1080×1920)

- Nada de texto acima de **y=220** nem abaixo de **y=1600**.
- O reel-kit levanta erro (`bandGeometry`) se o card invadir a zona — confie no
  erro, não force.
- Em 1:1 ou 4:5, recalcule: a UI do Instagram cobre proporcionalmente menos, mas
  o CTA do anúncio come a base.

## 6. Voz

Direto, confiante, sem jargão de IA, sem se vender como mágico. Português do
Brasil, frases curtas, sem emoji. Foco em respeito ao projeto e controle do
arquiteto.

- Palavras a usar: "fidelidade ao projeto", "geometria preservada", "o projeto
  continua seu", **"nodes"**.
- Palavras a evitar: **"créditos"** (é node), "sou arquiteto"/"de arquiteto pra
  arquiteto" em primeira pessoa, qualquer superlativo de IA.
- Preço/plano na tela: reconfira `lib/plans.ts` antes de escrever. Nunca citar
  plano anual — a venda está desligada.

## 7. Assinatura de marca

Todo Reel fecha com o card `final`: logo monocromático + pílula `CTA →` +
microcopy (default "80 nodes grátis · sem cartão · em português"), 1,2s.
URL na arte só quando `"url": "spacenode.app"` for pedido.

CTA padrão da fase atual (pós-lançamento): **"Teste grátis no link da bio"** em
orgânico; em anúncio, o CTA vem do formato do Meta e o card final carrega o
benefício, não a URL.
