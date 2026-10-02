# Distribuição do plugin SketchUp — checklist do dono

Estado: Fases 0–3 no ar (código); distribuição pública depende dos passos
manuais abaixo. Fonte das políticas: pesquisa verificada de 2026-09-01
(help.sketchup.com, ruby.sketchup.com, forums.sketchup.com — refs no plano
mestre).

## 0. Antes de qualquer canal

- [ ] **Smoke real no SketchUp** (Windows, ideal também macOS):
      conectar → gerar pago → cancelar no meio → reconectar após 1h →
      lote de 2–3 cenas → ampliar → editar → criar Space.
      Pontos sem teste possível fora do SketchUp: `pages.selected_page=`
      síncrono pra captura de lote; convenção UTC do `ShadowTime`;
      `set_position` fora da tela na renovação silenciosa.
- [ ] Rebuild final e cópia pro site (os dois comandos gravam `dist/` E
      `public/downloads/` — o site serve o segundo; já aconteceu de só o
      `dist/` ser regerado e a página anunciar uma versão enquanto o download
      entregava outra):
      ```powershell
      npm run package:sketchup          # Windows (PowerShell)
      ```
      ```bash
      npm run package:sketchup:posix    # macOS / Linux (zip do sistema)
      ```
      Commitar o binário (~650 KB com o atlas da barra nativa).
- [ ] Versões em sincronia nos TRÊS lugares: `sketchup/spacenode.rb`
      (EXTENSION.version), `sketchup/spacenode/main.rb` (VERSION) e
      `lib/sketchup/plugin-release.ts` (PLUGIN_VERSION — página de download
      e aviso de atualização). `npm run package:sketchup:check` falha se
      divergirem; o empacotador POSIX também recusa gerar.
- [ ] Binários de marca regerados quando o símbolo mudar:
      `node scripts/sketchup-glassbar-atlas.mjs` (atlas Win32, 4 escalas) e
      `node scripts/sketchup-toolbar-icons.mjs` (PNG 24/48) — os dois leem
      `public/brand/spacenode-symbol.svg`.
- [ ] Harness offline antes de empacotar: `ruby scripts/verify-sketchup-ruby.rb`,
      `SKETCHUP_TEST_CHANNEL=chrome node scripts/verify-sketchup-flow.mjs` e
      `SKETCHUP_TEST_CHANNEL=chrome node scripts/verify-sketchup-revisao.mjs`
      (no Mac, com o Chrome instalado; sem o canal, `npx playwright install chromium`).

## 0.1 Ordem de publicação (desde a 1.9.0)

A página de download e o aviso dentro do plugin leem `PLUGIN_VERSION`
(`lib/sketchup/plugin-release.ts`): o merge na `main` publica os dois junto com
o `.rbz` de `public/downloads/`. Então **assinar antes de mergear**:

1. Na branch da release, `npm run verify:sketchup` verde e `.rbz` gerado
   (`dist/` e `public/downloads/` idênticos, `package:sketchup:verify` ok).
2. Subir `public/downloads/spacenode-sketchup.rbz` no Extension Signature
   Portal; o `.rbz` ASSINADO que volta substitui os dois arquivos (o
   `package:sketchup:verify` tolera a entrada de assinatura a mais, mas
   qualquer rebuild depois disso invalida a assinatura).
3. Só então commitar os binários e mergear → deploy: o catálogo (v10,
   `supports.seed`, `seedApplied`, `edgeMapNative`) e a versão nova sobem
   juntos, e quem está na 1.8.1 vê "1.9.0 disponível — baixar" no rodapé.

Se for preciso publicar o servidor antes da assinatura, manter
`PLUGIN_VERSION` na versão anterior nesse deploy (os três textos de versão
precisam bater só no commit do `.rbz`).

## 1. Assinatura digital (obrigatória na prática)

A política de carregamento "Identified Extensions Only" do SketchUp bloqueia
extensão sem assinatura — e não dá pra saber quantos usuários estão nesse
modo. **Assinar sempre, mesmo distribuindo só pelo site.**

- [ ] Conta Trimble ID (a mesma do SketchUp serve).
- [ ] Subir o `.rbz` no **Extension Signature Portal**:
      <https://extensions.sketchup.com/extension/sign>
      O portal injeta o arquivo de assinatura e devolve o `.rbz` assinado —
      **é esse arquivo** que vai pro `public/downloads/`.
- [ ] Repetir a assinatura a **cada build novo** (assinatura casa com o
      conteúdo exato do zip).

## 2. Site próprio (canal primário — já pronto no código)

- [ ] Página `/sketchup` no ar com o botão de download.
- [ ] A cada release: rebuild → assinar no portal → substituir
      `public/downloads/spacenode-sketchup.rbz` (mesmo nome estável — links
      externos não quebram) → deploy.

## 3. Extension Warehouse (descoberta)

Precedente: Veras/ArkoAI/Enscape estão no EW exigindo conta e assinatura
própria — o modelo SPACENODE é aceito.

- [ ] Conta de developer no EW (Trimble ID; sem custo de listagem).
- [ ] Requisitos técnicos já atendidos no código: `.rb` raiz só registra;
      pasta com o mesmo nome; namespace único; sem globals/`puts`;
      HtmlDialog (não WebDialog). **Não pré-criptografar** — o EW converte
      `.rb`→`.rbe` sozinho (pré-criptografar é motivo de rejeição).
- [ ] **No campo "tester instructions" da submissão: credenciais de uma
      conta de teste paga** (prática confirmada pelo revisor da Trimble no
      fórum — sem isso a revisão de extensão paga é negada).
- [ ] Descrição/screenshots: seguir `docs/marketing/visual-guidelines.md`
      (tema escuro, sem hype). Considerar EN — a revisão é em inglês.
- [ ] Ler os Developer Terms antes de submeter (página só renderiza com JS,
      não foi possível verificar por fetch):
      <https://extensions.sketchup.com/developer-terms-of-service>

## 4. SketchUcation ExtensionStore (canal de baixo atrito)

- [ ] Cadastro de autor em <https://sketchucation.com/pluginstore> e upload
      do mesmo `.rbz` assinado. Requisitos bem mais leves que o EW.

## 5. macOS

- [ ] O zip já sai com separadores `/` (testado no script). Falta smoke real.
- [ ] Ícone: PNG 24/48 já embarcado (SVG não renderiza em toolbar no Mac).
      PDF vetorial fica como melhoria futura.

## Melhorias futuras (fora deste checklist)

- ~~Verificação de atualização no painel~~ — feita na 1.0.4 (catálogo
  `pluginLatest`); desde a 1.9.0 o aviso também fica no rodapé do painel.
- ~~i18n EN do painel~~ — feita na 0.5.0 (pareamento por código + EN).
  Pendente: ~65 mensagens literais em pt-BR dentro do `main.rb` que saltam
  o `t()` (erros de ampliação/edição/câmera).
- ~~Pareamento por código no navegador do sistema~~ — feito na 0.5.0.
- Extension Warehouse e SketchUcation seguem sem dono: precisam da
  assinatura do `.rbz` (seção 1) e de uma conta de teste paga na submissão.
