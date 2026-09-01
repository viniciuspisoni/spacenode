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
- [ ] Rebuild final e cópia pro site:
      ```powershell
      npm run package:sketchup -- -OutputPath public/downloads/spacenode-sketchup.rbz
      ```
      (o script aceita `-OutputPath`; commitar o binário — ~50 KB.)
- [ ] Versões em sincronia: `sketchup/spacenode.rb` (EXTENSION.version) e
      `sketchup/spacenode/main.rb` (VERSION) — as duas na mesma string.

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

- Verificação de atualização no painel (o catálogo pode carregar
  `latestVersion` e o painel avisar).
- i18n EN do painel (hoje pt-BR hardcoded — o EW aceita, mas limita o
  alcance internacional).
- Pareamento por código no navegador do sistema (decisão 04 do plano
  mestre; exige migration de device sessions — destrava login Google
  dentro do plugin).
