# SPACENODE para SketchUp

Extensão oficial da SPACENODE: renderização fotorrealista das vistas do
SketchUp com o mesmo motor de fidelidade do app web.

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

## Compatibilidade

SketchUp 2021+ (gate em runtime); alvo suportado e testado: **2024, 2025 e
2026** (Ruby 3.2.2; HtmlDialog CEF 112/128/137).

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
`lighting`, `background`, `sceneElements[]`, `fidelityLevel`, `engine`,
`resolution`, `useAnchor`, `seed`. O Ruby captura a vista (PNG, lado maior
2048–4096 px conforme a resolução), sobe via `sourceKey` e monta o corpo do
`/api/generate`. Em variações (`useAnchor`), o render anterior vai como
`anchorUrl`. `geometryLock`/`fidelityMode` não são enviados (são no-ops na
rota — decisão documentada no plano mestre 2026-09-01).
