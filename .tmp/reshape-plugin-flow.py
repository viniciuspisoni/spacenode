from pathlib import Path

p = Path('sketchup/spacenode/dialog.html')
s = p.read_text(encoding='utf-8')

def take(start, end):
    global s
    a = s.index(start)
    b = s.index(end, a)
    part = s[a:b]
    s = s[:a] + s[b:]
    return part

# Keep the existing controls/bridge and give each action a clear home.
preview = take('      <div class="preview" id="preview">', '      <div class="result-actions" id="resultActions">')
result = take('      <div class="result-actions" id="resultActions">', '      <details id="scenesSection">')
scenes = take('      <details id="scenesSection">', '      <details id="spaceSection">')
space = take('      <details id="spaceSection">', '      <section class="section">')
config = take('      <section class="section">', '      <div class="notice" id="notice"')
engine_start = config.index('      <section class="section">\n        <span class="section-label" id="L_engine">')
engines = config[engine_start:]
config = config[:engine_start]

def extract(text, start, end):
    a = text.index(start)
    b = text.index(end, a) + len(end)
    return text[:a] + text[b:], text[a:b]

scenes, batch_button = extract(scenes, '          <button class="cta cta--batch" id="batchButton"', '</button>')
space, space_button = extract(space, '          <button class="cta cta--batch" id="spaceButton"', '</button>')
scenes, batch_progress = extract(scenes, '          <div class="batch-progress" id="batchProgress"', '<div class="history-grid" id="batchResults" style="margin-top:8px"></div>')
space, space_progress = extract(space, '          <div class="batch-progress" id="spaceProgress"', '<button class="ghost history-more" id="openSpaceButton" style="display:none">Abrir o Space no site</button>')
scenes = scenes.replace('<details id="scenesSection">', '<details id="scenesSection" open>')
space = space.replace('<details id="spaceSection">', '<details id="spaceSection" open>')
scenes = scenes.replace('<div class="pills" id="scenesPills">', '<div class="scene-tools"><button class="ghost" id="selectAllScenes" type="button">Selecionar todas</button><button class="ghost" id="refreshScenes" type="button">Atualizar cenas</button></div>\n          <div class="pills" id="scenesPills">')

views = '''      <section id="sourceView" aria-labelledby="sourceTitle">
        <h1 class="flow-title" id="sourceTitle">O que vamos renderizar?</h1>
        <p class="flow-intro" id="sourceIntro">Escolha uma vista ou trabalhe com as cenas do modelo.</p>
        <div class="mode-options" role="group" aria-label="Fluxo de geração">
          <button class="mode-option" id="modeRender" type="button" aria-pressed="true">Uma vista</button>
          <button class="mode-option" id="modeBatch" type="button" aria-pressed="false">Cenas em lote</button>
          <button class="mode-option" id="modeSpace" type="button" aria-pressed="false">Criar Space</button>
        </div>
        <p class="flow-hint" id="modeHint"></p>
        <div id="sourcePreviewSlot"><div id="previewPanel">
''' + preview + '''        </div></div>
''' + scenes + space + '''      </section>

      <section id="configureView" aria-labelledby="configureTitle" hidden>
        <div class="flow-heading"><h1 class="flow-title" id="configureTitle">Configure seu render</h1><button class="text-button" id="changeSource" type="button">Alterar vista</button></div>
        <p class="flow-intro" id="configureContext"></p>
        <div class="engine-panel" id="enginePanel" tabindex="-1">
''' + engines + '''          <p class="flow-hint" id="engineHint">O custo acompanha o motor e a qualidade escolhidos.</p>
        </div>
        <div id="renderSettings">
''' + config + '''        </div>
        <p class="flow-hint" id="spaceConfigHint" hidden>O Space usa a vista atual como referência do projeto e as cenas selecionadas como novas vistas.</p>
      </section>

      <section id="resultView" aria-labelledby="resultTitle" hidden>
        <div class="flow-heading"><h1 class="flow-title" id="resultTitle">Seu resultado</h1><button class="text-button" id="editConfiguration" type="button">Ajustar configuração</button></div>
        <div id="resultPreviewSlot"></div>
        <div id="batchOutput">''' + batch_progress + '''</div>
        <div id="spaceOutput">''' + space_progress + '''</div>
''' + result + '''      </section>

'''
s = s.replace('      <div class="notice" id="notice"', views + '      <div class="notice" id="notice"', 1)
s = s.replace('    <main id="main">', '''    <nav class="workflow-nav" aria-label="Etapas do render">
      <button id="stepSource" type="button" aria-current="step"><span>1</span><b id="stepSourceLabel">Vista</b></button>
      <button id="stepConfigure" type="button"><span>2</span><b id="stepConfigureLabel">Configurar</b></button>
      <button id="stepResult" type="button" disabled><span>3</span><b id="stepResultLabel">Resultado</b></button>
    </nav>
    <main id="main">''')
s = s.replace('      <button class="cta" id="generateButton"', '''      <p class="dock-guidance" id="workflowGuidance" role="status" aria-live="polite"></p>
      <button class="cta" id="workflowNextButton" type="button"><span id="workflowNextLabel">Configurar render</span><span aria-hidden="true">→</span></button>
      <button class="cta" id="newRenderButton" type="button" hidden>Renderizar outra vista</button>
''' + batch_button.replace('cta cta--batch', 'cta').replace(' disabled>', ' disabled hidden>') + '\n' + space_button.replace('cta cta--batch', 'cta').replace(' disabled>', ' disabled hidden>') + '\n      <button class="cta" id="generateButton"')
s = s.replace('id="generateButton" disabled', 'id="generateButton" hidden disabled')
s = s.replace('      authenticated: false,', "      workflowStep: 'source', workflowMode: 'render', hasWorkflowOutput: false,\n      authenticated: false,", 1)
s = s.replace('    .shell { height: 100vh; display: grid; grid-template-rows: auto 1fr auto auto; }', '    .shell { height: 100vh; display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto auto; }')
css = '''
    /* Flow navigation remains visible, even with a portrait capture. CEF 88+. */
    [hidden] { display: none !important; }
    .workflow-nav { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; padding: 8px 16px; border-bottom: 0.5px solid var(--border); }
    .workflow-nav button { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 2px; border-radius: 10px; color: var(--text-3); font-size: 11px; }
    .workflow-nav b { font-weight: 550; }
    .workflow-nav span { display: grid; place-items: center; width: 19px; height: 19px; border-radius: 50%; border: 0.5px solid var(--border-strong); font-size: 10px; }
    .workflow-nav button[aria-current="step"] { background: var(--surface); color: var(--text); }
    .workflow-nav button[aria-current="step"] span { background: var(--inverse); color: var(--inverse-fg); }
    .workflow-nav button:disabled { opacity: .4; }
    .flow-title { font-size: 19px; font-weight: 570; letter-spacing: -.035em; margin: 0; }
    .flow-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .flow-intro { font-size: 12px; color: var(--text-3); margin: 5px 0 16px; }
    .flow-hint { font-size: 11px; color: var(--text-2); margin: 10px 0 12px; }
    .mode-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; padding: 4px; background: var(--surface); border-radius: 14px; }
    .mode-option { padding: 10px 3px; font-size: 11px; color: var(--text-3); border-radius: 11px; }
    .mode-option[aria-pressed="true"] { background: var(--bg-elevated); color: var(--text); box-shadow: var(--shadow-sm); }
    .mode-option:disabled { opacity: .4; }
    .text-button { font-size: 11px; color: var(--text-2); text-decoration: underline; text-underline-offset: 3px; }
    .engine-panel { padding: 14px; border: 0.5px solid var(--border-strong); border-radius: 16px; background: var(--surface-subtle); margin: 12px 0 20px; }
    .engine-panel .section:first-child { margin-top: 0; }
    .engine-panel .section:last-of-type { margin-bottom: 0; }
    .engine-panel .flow-hint { margin-bottom: 0; color: var(--text-3); }
    #engineCards { grid-template-columns: 1fr; gap: 7px; }
    #engineCards .card { display: grid; grid-template-columns: 1fr auto; text-align: left; gap: 2px 8px; padding: 12px; border-radius: 12px; }
    #engineCards .card b { font-size: 13px; }
    #engineCards .card > span { grid-column: 1; margin: 0; font-size: 11px; }
    #engineCards .card .engine-price { grid-column: 2; grid-row: 1 / 3; align-self: center; font-size: 11px; white-space: nowrap; }
    #engineCards .card.is-active b::after { content: ' ✓'; }
    #resolutionCards { grid-template-columns: repeat(auto-fit, minmax(70px, 1fr)); }
    .preview { height: 200px; max-height: 30vh; aspect-ratio: auto !important; border-radius: 16px; }
    #resultView .preview { height: 310px; max-height: 45vh; }
    #sourceView .preview-actions { margin-bottom: 14px; }
    #resultView .preview-actions #captureButton { display: none; }
    .scene-tools { display: flex; gap: 6px; margin-bottom: 10px; }
    #scenesSection > summary, #spaceSection > summary { pointer-events: none; }
    #scenesSection > summary::after, #spaceSection > summary::after { display: none; }
    .dock-guidance { font-size: 11px; color: var(--text-2); margin: 0 0 8px; }
    .dock-guidance:empty { display: none; }
    .dock-summary { color: var(--text-2); font-size: 12px; padding: 6px 0; }
    .dock-summary::after { content: ' ↗'; }
    .connection { margin-top: 0; }
    .connection.is-connected { padding: 7px 10px; }
    .connection.is-connected .conn-sub { display: none; }
    @media (max-height: 640px) { header { padding-top: 8px; padding-bottom: 8px; } .workflow-nav { padding-top: 4px; padding-bottom: 4px; } footer { min-height: 24px; padding-top: 4px; padding-bottom: 4px; } }
'''
s = s.replace('  </style>', css + '  </style>', 1)
p.write_text(s, encoding='utf-8')
