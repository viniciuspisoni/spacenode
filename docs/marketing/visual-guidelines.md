# SPACENODE — Diretrizes visuais para conteúdo

> Regras visuais das peças de conteúdo. Fonte da verdade:
> [`content-factory/brand-rules.md`](../../content-factory/brand-rules.md) §5 — este documento a
> operacionaliza para o fluxo editorial. Os templates HTML parametrizáveis estão em
> `content-factory/templates/`.

---

## 1. Paleta (dark-first — é a cara da marca)

| Papel | Valor |
|---|---|
| Fundo | `#0a0a0a` (elevado: `#111111`) |
| Texto principal | `#f5f5f7` |
| Texto secundário | `#a1a1a6` |
| Texto terciário | `#6e6e73` |
| Hairline/borda | `rgba(255,255,255,0.08)` |
| Verde (acento) | `#30d158` — **apenas funcional** |

Variante light (uso excepcional, ex.: carrossel técnico): fundo `#fafafa`, texto `#1a1a1a`,
verde `#30b46c`.

Uso predominante de branco, preto e cinzas. **Verde ocupa menos de 5% da área**: um ponto no
eyebrow, um sublinhado de CTA, um marcador. Nunca fundo verde, nunca gradiente, nunca headline
verde, nunca grandes áreas verdes.

## 2. Tipografia

- **Geist** — a fonte do produto (`public/fonts/geist-latin.woff2`). Nenhuma outra.
- Títulos: peso 600–700, tracking apertado (−0.02em).
- Eyebrow: uppercase, letterspacing largo (0.28em), com hairline horizontal — convenção da
  landing.
- No máximo **2 pesos de fonte** por peça e **3 níveis de texto** (eyebrow, headline, apoio).

## 3. Layout e composição

- Layouts limpos, bastante espaço vazio; margens generosas (≥96px em arte de 1080px).
- Um ponto focal por peça. A **arquitetura é o elemento principal** — o layout serve a imagem,
  não o contrário.
- Bordas finas (hairline), cantos suaves, aparência premium e contida.
- Logo/wordmark SPACENODE: **100% monocromático, sempre** (política de 2026-07-02 — a versão com
  nó verde foi aposentada).
- Grid consistente entre slides de um mesmo carrossel.

## 4. Imagens

- Renders e telas **reais do produto e de projetos reais**. Nunca banco de imagem genérico de
  tecnologia, nunca mockup 3D de stock, nunca "escritório feliz".
- **Não redesenhar, reinterpretar ou alterar imagens arquitetônicas para adequá-las ao layout.**
  A peça valoriza a imagem original e o resultado real produzido pelo SpaceNode. Ajustes
  permitidos: recorte/enquadramento, e overlay gráfico descrito abaixo.
- O antes/depois é o device visual da marca — pode receber linhas de fuga/régua sobrepostas como
  elemento gráfico (traço fino, branco ou verde funcional).
- Imagem de projeto de usuário: só com permissão registrada
  (`content_projects.permission_status = granted`) e crédito quando acordado.
- Screenshots do produto: tela real, tema escuro, sem dado pessoal de usuário visível (nome,
  e-mail, saldo).

## 5. Estética proibida (a "cara de startup de IA" que nunca teremos)

- Gradientes roxo/azul/neon, glow, partículas, blobs.
- Robôs, cérebros, circuitos, mãos brilhantes, olhos de HAL — qualquer "AI fantasy".
- Mockups 3D genéricos de banco de imagem, stock photos de tecnologia.
- Emoji na arte, setas gordas, selos "NOVO!!".
- Mais de 2 pesos de fonte na mesma peça.
- Estética neon em qualquer forma.

## 6. Formatos de arte

| Formato | Dimensões | Template |
|---|---|---|
| Quadrado | 1080×1080 | `content-factory/templates/` (quadrado) |
| Vertical | 1080×1350 | idem (vertical) |
| Story/Reels | 1080×1920 | idem (story) |
| Carrossel | 5× 1080×1350 | idem (carrossel) |

Export: abrir o preview HTML → DevTools → capture node screenshot do nó `.canvas` (PNG na
resolução exata). Os templates conceituais registrados em `marketing.content_templates` apontam
para esses formatos.

## 7. Checklist visual de revisão

1. Verde < 5% da área e apenas funcional?
2. Wordmark monocromático?
3. Só Geist, ≤2 pesos, ≤3 níveis de texto?
4. Margens ≥96px e um único ponto focal?
5. Imagem real (produto/projeto), sem stock e sem reinterpretação da arquitetura?
6. Nenhum item da estética proibida?
7. Sem URL escrita na arte; sem emoji na arte?
8. Screenshot sem dados pessoais de usuário?
