# SPACENODE para SketchUp

Extensão oficial da SPACENODE: renderização fotorrealista das vistas do
SketchUp com o mesmo motor de fidelidade do app web.

## Superpoderes nativos (Fase 2)

O que só um plugin dentro do modelo consegue:

- **Cenas em lote** — selecione as cenas do modelo e gere o caderno inteiro
  com os mesmos presets e a mesma semente (coerência de material/estilo).
  Falha de uma cena não derruba o lote; saldo insuficiente aborta o resto.
- **Captura determinística** — sketchy edges, extensão de linha, névoa,
  guias e a grade de seção saem da imagem que a IA vê (restauro manual das
  RenderingOptions — nunca via abort_operation, que não as reverte).
- **Edge map nativo** — segunda captura em hidden-line da MESMA câmera vira
  o mapa estrutural do motor de fidelidade (`edgeMapKey` no /api/generate),
  no lugar do edge map inferido do pixel.
- **Sol e lente reais no prompt** — posição solar calculada do ShadowInfo
  (lat/long/hora) + FOV/focal da câmera viram `modelFacts` (bloco MODEL
  FACTS do ramo Máxima). Presets de sol (Manhã/Meio-dia/Entardecer/Golden
  hour) aplicados só durante a captura.
- **Materiais do modelo** — texturas reais exportadas como `materialRefs`
  (até 4, superfície escolhida no painel).
- **Voltar à vista** — cada render guarda a câmera; um clique restaura o
  enquadramento exato no SketchUp.

## Arquitetura

- `spacenode.rb` — só registra a extensão (requisito do Extension Warehouse).
- `spacenode/main.rb` — núcleo: toolbar, painel `HtmlDialog`, captura em alta
  resolução (`view.write_image` até 4096 px), upload direto ao Storage
  (sign → PUT → `sourceKey`) e geração via `/api/generate`. Todo HTTP é
  assíncrono via `Sketchup::Http::Request` (nunca `Thread.new`).
- `spacenode/dialog.html` — painel com paridade do Renderizar: presets
  oficiais (segmento → espaço → iluminação → entorno), motores com custo em
  Nodes, comparador antes/depois, histórico e saldo.
- `spacenode/assets/` — ConstellationN (SVG p/ Windows, PNG p/ macOS) e a
  fonte Geist embarcada.

Rotas web do plugin:

- `/sketchup/connect` — entrega a sessão Supabase ao plugin (nonce de uso
  único ecoado; senha nunca passa pelo plugin).
- `GET /api/sketchup/session` — valida sessão + saldo do pagador.
- `GET /api/sketchup/catalog` — motores, custos e taxonomia de presets
  (fonte única remota; nada de preço hardcodado em Ruby).
- `GET /api/sketchup/render?id=` — reconciliação: recupera um render pago
  quando a conexão caiu no meio da geração.
- `POST /api/uploads/sign` + PUT direto no Storage — a imagem nunca passa
  pelo corpo da função (teto de 4,5 MB da Vercel).
- `POST /api/generate` — geração (aceita `Authorization: Bearer`).

## Sessão e segurança

- O plugin recebe apenas o access token da sessão (expira em ~1h) e o
  renova de forma silenciosa reabrindo `/sketchup/connect` fora da área
  visível — o refresh token nunca sai do navegador embutido.
- O payload da conexão só é aceito se ecoar o nonce gerado pelo Ruby.
- `expiresAt` ausente conta como sessão vencida (nunca "válida pra sempre").
- API base aceita apenas HTTPS (HTTP só em localhost).

## Tema (claro / escuro / automático)

O painel tem os mesmos dois temas do app web. Os tokens de `dialog.html` são
espelho EXATO de `app/globals.css` (`:root` = dark, `html.light` = claro) —
se um valor mudar no app, mudar aqui junto. Resolução do "Automático", na
mesma ordem do app quando o device é novo:

1. escolha local no painel (`Sketchup.write_default(PREFERENCES_KEY, 'theme')`,
   mesmo padrão do override de idioma);
2. preferência da conta (`profiles.theme_preference`, entregue por
   `GET /api/sketchup/session` como `theme`);
3. tema do sistema operacional (`prefers-color-scheme` no CEF);
4. escuro.

Anti-flash: o último tema resolvido fica em `localStorage('spn-theme')` e um
script inline no `<head>` aplica `html.light` antes do primeiro paint; o
estado do Ruby chega depois do `ready` e corrige se preciso.

Cores que NÃO seguem o tema, de propósito: véus sobre imagem (`--scrim`,
`--scrim-strong` e os textos do overlay de geração), o pincel verde da
máscara sobre o render, e o preto/branco do canvas que vira o PNG da máscara
enviado ao servidor.

## Compatibilidade

SketchUp 2021+ (gate em runtime). Testado em campo no **2022** (Windows);
alvo de suporte: 2024/2025/2026 (Ruby 3.2.2; HtmlDialog CEF 112/128/137).

## Empacotar

```powershell
npm run package:sketchup
```

Gera `dist/spacenode-sketchup.rbz` (zip com separadores `/`, compatível com
o SketchUp do macOS). Instalação: `Window > Extension Manager > Install
Extension`.

> Antes de distribuir fora do repo: assinar o `.rbz` no Extension Signature
> Portal (https://extensions.sketchup.com/extension/sign) — usuários com a
> política "Identified Extensions Only" não carregam extensão sem assinatura.

## Desenvolvimento local

1. Suba o app: `npm run dev` (porta 3000 — o login Google só funciona nela).
2. No painel do plugin, abra "Conexão avançada" e aponte o servidor para
   `http://localhost:3000`.
3. Para carregar a extensão direto do repo, no Ruby Console do SketchUp:

```ruby
$LOAD_PATH.unshift 'C:/Users/Pisoni/spacenode-sketchup/sketchup'
require 'spacenode/main'
```

(Depois de alterar o Ruby, reinicie o SketchUp e rode o `require` de novo —
`require` não recarrega arquivo já carregado.)

## Contrato enviado para geração

O painel envia pro Ruby: `prompt`, `projectType`, `segment`, `environment`,
`lighting`, `background`, `sceneElements[]`, `engine`, `resolution`,
`useAnchor`, `seed`. `fidelityLevel` é sempre `maximum` (o Ruby fixa e o
servidor coage — o seletor Máxima/Equilibrado/Criativo foi descontinuado em
2026-09-03 porque os níveis relaxados deixavam a IA alucinar no projeto). O Ruby captura a vista (PNG, lado maior
2048–4096 px conforme a resolução), sobe via `sourceKey` e monta o corpo do
`/api/generate`. Em variações (`useAnchor`), o render anterior vai como
`anchorUrl`. `geometryLock`/`fidelityMode` não são enviados (são no-ops na
rota — decisão documentada no plano mestre 2026-09-01).
