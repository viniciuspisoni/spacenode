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

## O que mudou na 0.8.0 — Fotografia

Princípio: a IA preserva o que vê. O que dá realismo ao render é a CAPTURA
sair como uma fotografia de arquitetura — proporção escolhida, lente
coerente, olho na altura de uma pessoa e verticais paralelas. Nova seção
"Fotografia" no painel, com HUD vivo da câmera (lente · fov · altura do olho
· inclinação) via `ViewObserver` (debounce de 250 ms em `UI.start_timer`).

- **Proporção** (Livre, 3:2, 4:3, 16:9, 1:1, 4:5, 9:16): aplicada na câmera
  viva (`camera.aspect_ratio=` — o SketchUp desenha a moldura cinza) e
  honrada pela captura: lado maior = alvo da resolução, o outro segue a
  proporção. Vale pra captura manual, geração, lote e Spaces.
- **Lente** (16/20/24/28/35/50 mm): focal equivalente full-frame medida pela
  ALTURA do sensor — `fov_v = 2·atan(12/f)`, gravada com `camera.fov=`
  (o fov do SketchUp é o ângulo vertical). Evita o número inflado do
  `camera.focal_length` (35° viram "57 mm" lá; na foto é um 38 mm). O mesmo
  valor vai pro prompt em `modelFacts.camera.focalLengthMm`.
- **Altura do olho** (Sentado 1,20 m / Em pé 1,60 m): `model.raytest` pra
  baixo a partir do olho acha o piso visível; olho e alvo sobem/descem juntos
  (a direção não muda). Sem piso abaixo → pills desligadas, hint explica. A
  altura medida vai pro prompt (`eyeHeightM`) como pista de escala.
- **Nivelar (2 pontos)**: SÓ NA CAPTURA, sem tocar na vista do usuário. Não
  existe setter de 2 pontos na API — o plugin faz o "shift de lente" na mão:
  câmera temporária nivelada com `fov' = fov + 2·inclinação`, render mais
  alto (`H' = 2·H·tan(h)/(tan(θ+fov/2) − tan(θ−fov/2))`) e recorte da faixa
  que corresponde ao quadro original via `Sketchup::ImageRep` (a ordem das
  linhas do buffer não é documentada — `crop_rows` sonda com
  `color_at_uv`). Preview do painel e edge map usam o MESMO plano (pixels
  alinhados). Limites: inclinação < 0,5° = nada a fazer; > 40° ou fov' > 118°
  = não nivela e avisa (`levelReason` no relatório de condicionamento).
  `twoPoint` no prompt só é verdade quando a captura saiu nivelada ou a
  câmera já estava (`is_2d?` / direção horizontal) — antes o heurístico
  marcava quase toda vista inclinada como 2 pontos.
- **Guias de composição** (Terços, Áurea, Centro, Diagonais): SVG sobre o
  preview do painel e, no SketchUp 2023+, `Sketchup::Overlay` na viewport
  (passivo: não toma cliques nem sai no export), dentro da moldura da
  proporção. Mesma tabela de segmentos nos dois lados.
- Ajustes persistem no estado do painel (`photoAspect/photoLevel/photoGuide`)
  e o painel os reenvia ao Ruby no `state` (`setPhoto`) — o Ruby guarda em
  `@photo` e usa como fallback em qualquer captura sem `:photo` explícito.
- Servidor: `sanitizeModelFacts` aceita `camera.eyeHeightM` (0,2–12 m) e o
  bloco MODEL FACTS ganha "camera X m above the floor".

## O que mudou na 0.7.0 — Animar

- **Animar este render**: take curto (Veo "Cinemático" 4/6/8 s, Kling
  "Rápido" 5/10 s) a partir do render na tela. Tipo (Apresentação, Detalhe,
  Tour só em interior, Reels só em render vertical) → qualidade → duração,
  com o custo em Nodes no pill, no botão e no bloco de saldo insuficiente.
- Fonte do vídeo = `previewUrl` do render (WebP ≤1600 px: cabe nos 15 MB da
  área `animar-source` e basta pra 1080p). O Ruby REVALIDA engine/duração/
  tipo contra o catálogo (`animar`, catálogo v6) antes de enviar; todos os
  valores vão como string (a rota lê com `str()`).
- **O painel não reproduz vídeo**: o CEF do SketchUp não decodifica H.264 em
  nenhuma versão (Trimble: wontfix) e o Animar entrega H.264. Resultado =
  pôster (o render) + "Abrir vídeo" (arquivo local ou navegador), "Salvar
  vídeo…", "Mostrar na pasta", "Ver no site". Sem `<video>`, nem atrás de
  gate.
- Auto-save em `<pasta do .skp>/spacenode-videos/<projeto>-<cena>-<dur>s.mp4`
  (nunca sobrescreve; toggle em Preferências → Vídeos). Modelo nunca salvo →
  aviso brando e o botão "Salvar vídeo…" segue vivo.
- `UI::Notification` nativa quando termina/falha (o arquiteto pode estar
  modelando com o painel atrás).
- Queda de rede depois do POST → reconciliação por `GET /api/video/history`
  (o vídeo mais novo criado depois do início). Cancelar depois do POST avisa
  que pode ter sido cobrado. `reconcile_lost_generation` (renders) passa a
  ignorar `ambient == 'video'`.
- `download_to_file` ganhou `kind: :video` (assinatura `ftyp`), watchdog de
  180 s e falha branda no auto-save; `image_ext_and_mime` (PNG/JPEG/WebP)
  também serve o Ampliar.
- Servidor: `/api/video` e `/api/video/history` aceitam Bearer; a resposta
  ganhou `id`, `totalBalance` e `createdAt`.
- Fora desta versão (próxima): frame final real (falAdapter → Veo
  `first-last-frame-to-video` com `generate_audio:false` e `resolution:'1080p'`
  explícitos; Kling `tail_image_url`) e o "take entre cenas" com a Δcâmera do
  modelo; "Animar todas as cenas do lote"; tira Vídeos no Histórico.

## O que mudou na 0.6.0

- **Fidelidade sempre máxima** — o seletor Máxima/Equilibrado/Criativo saiu
  (web e plugin); o servidor coage. Edge map nativo vai em toda cena sem
  âncora.
- **Tema claro / escuro / automático** (ver seção Tema).
- **Âncora explícita** — o CTA principal sempre gera do zero; "Gerar
  variação deste render" é botão próprio e só ancora se a câmera ainda é a
  do render (2% da distância olho→alvo, 0,5° de FOV); divergiu, gera sem
  âncora e avisa.
- **Dock** — o botão Gerar vive numa barra fixa acima do rodapé, com resumo
  clicável da configuração, custo, saldo e a tecla de atalho (Ctrl+Enter /
  ⌘⏎).
- **Higiene de captura v2** — X-ray, cor por tag, cotas, textos, eixos,
  marca d'água e wireframe/monocromático ficam de fora só durante a captura
  (`RenderMode` texturizado). Cortes NÃO são ligados à força; só o
  preenchimento.
- **Degradação visível** — edge map, materiais e preset de sol que falham
  aparecem no resultado (`conditioning`), com o motivo por material;
  texturas fora de jpg/png nascem desabilitadas na lista.
- **Sessão por etapa** — folga de 10 min e renovação antes de cada cena do
  lote e de cada etapa do Space; falha de renovação dentro de lote/Space
  encerra o contexto (nunca mais overlay preso).
- **Resultado vivo** — URLs assinadas vencem em 1 h; o painel re-assina por
  `renderId` (`GET /api/sketchup/render`) ao restaurar, no erro da imagem
  e antes de qualquer ação; miniatura do Histórico traz o render pro painel.

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
