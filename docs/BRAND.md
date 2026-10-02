# Marca no código — Manual da Marca v2.2

Fonte da verdade: [*SpaceNode — Manual da Marca v2.2, Paleta Digital*](../marketing/brand/SpaceNode-Manual-da-Marca-v2.2.pdf) (29/09/2026).
A base da identidade foi aprovada em 25/09/2026. Sistema oficial: **N estrutural + Geist +
neutros + vidro pontual.** Três cores secundárias ampliam a comunicação sem recolorir o logo.
Esta edição substitui as diretrizes anteriores de cor para a comunicação.

## Regras que mais aparecem no código

- **Marca monocromática.** Nenhum verde em logos, ícones, botões, badges, links, estados ou acentos.
  Vegetação e materiais nas imagens mantêm suas cores naturais.
- **Seleção** se mostra por fundo, preenchimento, contorno e rótulo — nunca só pela cor.
- **Sucesso:** ícone neutro + rótulo. **Aviso e erro:** mensagem explícita, cor semântica só no apoio.
- **Vidro** apenas em navegação e controles flutuantes sobre conteúdo. Sem vidro empilhado nem atrás de
  tabelas; leitura longa e decisões em superfícies sólidas.
- **Grafia:** `SpaceNode` em textos corridos; `spacenode` minúsculo só no desenho do wordmark (e em
  URLs, arquivos, chaves); `SPACENODE` em etiquetas.
- **Voz:** direta e serena, vocabulário de arquitetura, sem promessas absolutas
  ("fidelidade absoluta", "nunca altera a geometria", "resultados incríveis em segundos").

## Componentes (`components/brand/`)

| Componente | Uso |
|---|---|
| `<Brandmark size={28} />` | Assinatura horizontal oficial (N + wordmark em curvas). Compacta de 144 a 191 px; principal desde 192 px. O N mantém o mesmo contorno. `tone`: `auto` (currentColor) · `primary` (Grafite) · `reverse` (Branco). |
| `<StructuralN size={24} />` | Símbolo isolado (avatar, favicon, espaços já identificados). Mesma matriz vetorial em todos os tamanhos; se as juntas fecharem, ampliar. |
| `<BrandLoader size={40} />` | Carregamento: os dois apoios e depois a ligação. Respeita movimento reduzido. |

`geometry.ts` guarda a matriz vetorial extraída do manual (grade 64 × 64, forma útil 56 × 56) e o
wordmark em curvas da assinatura mostrada no PDF (corpo 55, início x=84, linha de base y=47,
tracking −0,025 em). O manual descreve o wordmark como derivado de Geist Medium; a aplicação usa
os contornos da peça, sem recompor o nome com fonte de interface.
Não redesenhar, distorcer, contornar, sombrear ou aplicar gradiente.

Os ícones do app (`app/icon.tsx`, `app/apple-icon.tsx`) e a imagem Open Graph
(`app/opengraph-image.tsx`) são gerados a partir dessa geometria; os textos da OG estão em curvas
(`og-type.ts`), então a peça não depende de fonte no gerador.

## Tokens (`app/globals.css`)

Paleta fixa: `--color-grafite` #151618 · `--color-branco` #FFFFFF · `--color-porcelana` #F7F7F5 ·
`--color-nevoa` #E8E9E7 · `--color-prata` #BDC2C8 · `--color-secundario` #60646B.

Paleta secundária de comunicação: `--color-sede-01` **#BAC3C6**,
`--color-sede-02` **#A3AEB0** e `--color-azul-destaques` **#4D6685**
(cor amostrada da captura dos destaques do Instagram em 29/09/2026).
**Não citar os nomes das tintas nem o fabricante em materiais públicos**; usar apenas os nomes do manual.
Usar as cores em fundos, cards, capas de destaque e detalhes de comunicação. Texto Grafite sobre
as duas cores da sede; texto branco sobre o azul dos destaques (5,9:1). A assinatura permanece
preta ou branca. A interface funcional do produto mantém os tokens neutros.

Tema escuro (padrão, base Grafite) e tema claro (`html.light` ou a classe de seção `.sn-theme-light`,
base Porcelana) usam os mesmos nomes:

| Token | Função |
|---|---|
| `--color-bg`, `--color-bg-elevated` | fundo da página; cartões, painéis, campos |
| `--color-surface`, `--color-surface-hover` | preenchimento sutil; hover e selecionado |
| `--color-text-primary/secondary/tertiary` | texto (todos ≥ 4,5:1 no próprio tema) |
| `--color-text-quaternary` | só desabilitado e decorativo |
| `--color-border`, `--color-border-strong` | filetes; campos e contornos de ênfase |
| `--color-accent`, `--color-on-accent` | CTA principal (neutro invertido) |
| `--color-danger*`, `--color-warning*` | apoio semântico de erro e aviso |
| `--color-glass*`, `--color-scrim` | vidro (via `.sn-glass`) e fundo de sobreposições |

## Tipografia

Geist Sans. Seguir os pesos especificados na página 13 do manual: Display e Título em Medium 500,
Corpo em Regular 400, Etiqueta em Medium 500. Semibold 600 fica disponível para casos pontuais.

Classes: `.sn-display` (56–80 px, −0,035 em; 36–48 px em telas estreitas), `.sn-title` (32–48 px,
−0,025 em), `.sn-body` (16–20 px, 1,5 de entrelinha), `.sn-label` (11–12 px, +0,10 em, caixa alta).

Ícones: uma família de traço, grade 24 px, espessura 1,5 px, cor neutra.

## Canais

- `public/brand/`: SVGs oficiais de aplicação clara e escura e PNG para email.
- `marketing/brand/` e `marketing/remotion/public/brand/`: os mesmos contornos para peças e vídeo.
- `sketchup/spacenode/assets/`: N estrutural (claro e escuro) e assinatura para o plugin; scripts de ícones e
  atlas da barra leem os SVGs compartilhados.
- `lib/email/send-invite-email.ts`: assinatura em PNG e CTA neutro.

O manual menciona um kit oficial separado. Os vetores aqui foram extraídos do PDF fornecido;
se o kit original for disponibilizado, conferir os contornos contra seus SVGs antes da publicação.

## Acessibilidade

Foco visível global (`:focus-visible`), `prefers-reduced-motion` desliga animações,
`prefers-reduced-transparency` e navegadores sem `backdrop-filter` recebem fundo opaco no vidro.
