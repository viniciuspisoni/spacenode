#!/usr/bin/env node
// Exercises the palette's event/command contract without Archicad or a browser.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const html = fs.readFileSync(path.join(root, 'ui/panel.html'), 'utf8')
const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n')
assert.ok(script.includes('SpaceNodeUI'), 'palette script found')

function createUi(language = 'pt-BR') {
  const sent = []
  const handlers = {}
  const elements = Object.fromEntries(['main', 'who', 'menu-disconnect', 'foot-api'].map((id) => [id, {
    id, innerHTML: '', textContent: '', hidden: false, title: '', setAttribute() {}
  }]))
  const document = {
    activeElement: null,
    documentElement: { lang: '', classList: { toggle() {} } },
    getElementById: (id) => elements[id] || null,
    addEventListener: (type, fn) => { handlers[type] = fn }
  }
  const window = {
    SpaceNode: { post: (raw) => sent.push(JSON.parse(raw)) },
    scrollY: 0,
    scrollTo() {},
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    console: { error: (e) => { throw e } }
  }
  vm.runInNewContext(script, { document, window, navigator: { language }, setTimeout, setInterval: () => 1, clearTimeout, console }, { filename: 'panel.html' })
  const receive = (type, payload) => window.SpaceNodeUI.receive({ type, payload })
  const click = (act, value = '') => handlers.click({ target: { closest: () => ({
    disabled: false, getAttribute: (name) => name === 'data-act' ? act : value
  }) } })
  return { sent, elements, window, receive, click, markup: () => elements.main.innerHTML }
}

const ui = createUi()
assert.equal(ui.sent[0].type, 'ready')
ui.receive('connection', { status: 'disconnected', apiBase: 'https://spacenode.app' })
assert.match(ui.markup(), /Conectar conta/)
assert.match(ui.markup(), /Testar captura 3D/)
ui.click('testCapture')
assert.equal(ui.sent.at(-1).type, 'testCapture')
ui.receive('error', { scope: 'capture', code: 'capture_demo' })
assert.match(ui.markup(), /modo Demo do Archicad não permite salvar/)
ui.receive('error', { scope: 'connect', code: 'not_found', httpStatus: 404 })
assert.match(ui.markup(), /HTTP 404/)
ui.click('connect')
assert.equal(ui.sent.at(-1).type, 'connect')
ui.receive('connection', { status: 'pairing', pairing: { userCode: '<b>K7QM</b>', expiresAt: Math.floor(Date.now() / 1000) + 600 } })
assert.ok(ui.markup().includes('&lt;b&gt;K7QM&lt;/b&gt;'))
assert.ok(!ui.markup().includes('<b>K7QM</b>'))
ui.click('cancelConnect')
assert.equal(ui.sent.at(-1).type, 'cancelConnect')

ui.receive('connection', { status: 'connected', email: 'user@example.test', apiBase: 'https://spacenode.app' })
ui.receive('session', { balance: { totalBalance: 100 }, theme: 'light' })
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/catalog.json'), 'utf8'))
catalog.engines[0].name = '<img src=x onerror=alert(1)>'
ui.receive('catalog', { catalog })
assert.match(ui.markup(), /Gerar render · 10 Nodes/)
assert.ok(ui.markup().includes('&lt;img src=x onerror=alert(1)&gt;'))
assert.ok(!ui.markup().includes('<img src=x onerror=alert(1)>'))
ui.click('generate')
assert.equal(ui.sent.at(-1).type, 'generate')
assert.equal(ui.sent.at(-1).payload.engine, 'vega')
assert.equal(ui.sent.at(-1).payload.resolution, 'hd')
ui.receive('session', { balance: { totalBalance: 1 } })
assert.match(ui.markup(), /Saldo insuficiente/)
assert.match(ui.markup(), /data-act="generate" disabled/)

ui.receive('capture', { width: 1920, height: 1080, diagnostic: true })
assert.match(ui.markup(), /Captura 3D concluída/)
ui.receive('result', { renderId: 'render-1', outputUrl: 'javascript:alert(1)', nodesCharged: 10 })
assert.ok(!ui.markup().includes('src="javascript:'))
ui.receive('result', { renderId: 'render-1', outputUrl: 'https://spacenode.app/render.png', nodesCharged: 10, signedAt: Math.floor(Date.now() / 1000) })
assert.match(ui.markup(), /src="https:\/\/spacenode.app\/render.png"/)
ui.click('save')
assert.equal(ui.sent.at(-1).type, 'save')
ui.receive('saved', { path: '/tmp/render.png' })
assert.match(ui.markup(), /Mostrar na pasta/)
ui.receive('result', { renderId: 'render-2', outputUrl: 'https://spacenode.app/render.png', signedAt: Math.floor(Date.now() / 1000) - 3600 })
assert.match(ui.markup(), /Atualizar link/)
ui.click('restore')
assert.equal(ui.sent.at(-1).type, 'restoreRender')
assert.equal(ui.sent.at(-1).payload.id, 'render-2')

const en = createUi('en-US')
en.receive('connection', { status: 'disconnected' })
assert.match(en.markup(), /Connect account/)
en.receive('error', { scope: 'capture', code: 'capture_demo' })
assert.match(en.markup(), /Archicad Demo cannot save/)

console.log('Palette contract OK — pairing, Demo, HTTP errors, catalog, cost, capture, result, save, signed link, escaping, PT/EN')
