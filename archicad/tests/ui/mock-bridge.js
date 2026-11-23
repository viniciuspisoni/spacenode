// Fake C++ side for exercising ui/panel.html in a plain browser (no Archicad).
// Mirrors the event contract of core/Controller.cpp. Scenario via URL hash:
//   #lowres  small capture warning    #no3d  capture fails    #short  low balance
//   #lost    generation connection loss   #expire  signed link already old
(function () {
  var hash = location.hash || '';
  var base = location.origin;
  var balance = hash.indexOf('short') >= 0 ? 6 : 90;
  var catalog = {
    engines: [
      { id: 'vega', name: 'Vega', description: 'Fidelidade absoluta. Entrega final.', resolutions: [{ id: 'hd', label: 'HD', nodes: 10 }, { id: '2k', label: '2K', nodes: 18 }, { id: '4k', label: '4K', nodes: 40 }] },
      { id: 'pulsar', name: 'Pulsar', description: 'Iteração e volume.', resolutions: [{ id: 'hd', label: 'HD', nodes: 4 }, { id: '2k', label: '2K', nodes: 8 }] },
      { id: 'quasar', name: 'Quasar', description: 'Padrão da casa: acabamento e fidelidade em equilíbrio.', resolutions: [{ id: 'hd', label: 'HD', nodes: 6 }, { id: '2k', label: '2K', nodes: 12 }] }
    ],
    defaults: { engine: 'quasar', resolution: '2k' },
    projectTypes: [
      { id: 'interior', label: 'Interior', backgroundLabel: 'Contexto visual', backgrounds: ['Preservar Original', 'Jardim', 'Cidade'],
        segments: [{ name: 'Residencial', environments: ['Sala de estar', 'Quarto', 'Cozinha'], lighting: ['Luz natural', 'Entardecer'], sceneElements: ['Plantas', 'Tapete', 'Cortinas'] },
                   { name: 'Comercial', environments: ['Escritório', 'Loja'], lighting: ['Luz branca'], sceneElements: ['Plantas'] }] },
      { id: 'exterior', label: 'Exterior', backgroundLabel: 'Entorno', backgrounds: ['Preservar Original', 'Paisagismo'],
        segments: [{ name: 'Residencial', environments: ['Fachada'], lighting: ['Golden hour'], sceneElements: [] }] }
    ],
    i18n: { presets: { 'Sala de estar': 'Living room', 'Quarto': 'Bedroom', 'Residencial': 'Residential', 'Luz natural': 'Natural light' }, ui: { projectTypes: { interior: 'Interior', exterior: 'Exterior' } } }
  };
  var out = function (type, payload) { setTimeout(function () { window.SpaceNodeUI.receive({ type: type, payload: payload || {} }); }, 0); };
  var connected = false;
  var timers = [];
  function later(ms, fn) { timers.push(setTimeout(fn, ms)); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function sessionAndCatalog() {
    out('connection', { status: 'connected', email: 'vinicius@example.com', apiBase: 'https://spacenode.app' });
    out('session', { email: 'vinicius@example.com', balance: { totalBalance: balance }, theme: /light/.test(hash) ? 'light' : 'dark' });
    later(500, function () { out('catalog', { catalog: catalog }); });
  }
  window.SpaceNode = { post: function (msg) {
    var m = JSON.parse(msg), t = m.type, p = m.payload || {};
    window.__sent = (window.__sent || []).concat([m]);
    if (t === 'ready') { if (connected) sessionAndCatalog(); else out('connection', { status: 'disconnected', apiBase: 'https://spacenode.app' }); }
    else if (t === 'connect') {
      out('connection', { status: 'pairing', pairing: {}, apiBase: 'https://spacenode.app' });
      later(600, function () { out('connection', { status: 'pairing', apiBase: 'https://spacenode.app', pairing: { userCode: 'K7QM-4XD2', verificationUrl: base + '/integrations/pair', expiresAt: Math.floor(Date.now() / 1000) + 600 } }); });
      later(5000, function () { connected = true; sessionAndCatalog(); });
    }
    else if (t === 'cancelConnect') { clearTimers(); out('connection', { status: 'disconnected', apiBase: 'https://spacenode.app' }); }
    else if (t === 'disconnect') { clearTimers(); connected = false; out('connection', { status: 'disconnected', apiBase: 'https://spacenode.app' }); }
    else if (t === 'refresh') out('session', { balance: { totalBalance: balance } });
    else if (t === 'generate') {
      if (hash.indexOf('no3d') >= 0) { out('error', { scope: 'capture', code: 'no_3d_view', message: '' }); return; }
      out('busy', { busy: true }); out('status', { stage: 'capture' });
      later(500, function () { out('capture', { width: /lowres/.test(hash) ? 640 : 1920, height: /lowres/.test(hash) ? 400 : 1080, viewName: '3D', lowResolution: /lowres/.test(hash) }); out('status', { stage: 'upload' }); });
      later(1500, function () { out('status', { stage: 'generate' }); });
      later(3500, function () {
        if (/lost/.test(hash)) { out('error', { scope: 'generate', code: 'generate_lost', message: '' }); out('busy', { busy: false }); return; }
        balance -= 18;
        out('result', { renderId: '0b2d6f0e-1c3a-4e5b-8f7a-9c0d1e2f3a4b', outputUrl: base + '/sample.svg', previewUrl: base + '/sample.svg', nodesCharged: 18, totalBalance: balance,
                        fidelityWarning: /warn/.test(hash), recovered: false, sourceWidth: 1920, sourceHeight: 1080, signedAt: Math.floor(Date.now() / 1000) - (/expire/.test(hash) ? 3600 : 0) });
        out('busy', { busy: false });
      });
    }
    else if (t === 'cancelGenerate') { clearTimers(); out('busy', { busy: false }); }
    else if (t === 'save') { later(600, function () { out('saved', { path: '/Users/me/Pictures/SpaceNode/spacenode-archicad-20261006-123456-0b2d6f0e.png', name: 'x.png' }); }); }
    else if (t === 'restoreRender') { out('result', { renderId: p.id, outputUrl: base + '/sample.svg', previewUrl: base + '/sample.svg', signedAt: Math.floor(Date.now() / 1000), restored: true }); }
  } };
})();
