#!/usr/bin/env node
// Starts a mock SpaceNode backend, builds + runs the C++ e2e client against it
// (real HTTP transport), then asserts what the SERVER saw. No Archicad, no
// SpaceNode account, no network beyond loopback.
//   node archicad/tests/e2e/run.mjs
import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { spawnSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-archicad-e2e-'))

// ── real PNGs (capture 1280x720, "render" 2048x1152) ──────────────────────────
function png(w, h) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const row = Buffer.alloc(1 + w * 3); for (let x = 0; x < w; x++) { row[1 + x * 3] = x % 256; row[2 + x * 3] = 120; row[3 + x * 3] = 200 }
  const raw = Buffer.concat(Array.from({ length: h }, () => row))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const capturePng = png(1280, 720)
const renderPng = png(2048, 1152)
const capturePath = path.join(work, 'capture-source.png')
fs.writeFileSync(capturePath, capturePng)

// ── mock backend ──────────────────────────────────────────────────────────────
const DEVICE_ID = '0b2d6f0e-1c3a-4e5b-8f7a-9c0d1e2f3a4b'
const DEVICE_SECRET = 'e2e-device-secret-' + crypto.randomBytes(6).toString('hex')
const RENDER_ID = '7d1f2e3a-4b5c-4d6e-8f70-91a2b3c4d5e6'
const catalog = JSON.parse(fs.readFileSync(path.join(here, '../fixtures/catalog.json'), 'utf8'))
const seen = { claims: 0, refreshes: 0, tokens: new Set(), uploads: [], generates: [], signs: [], staleUse: 0, requests: [] }
let currentToken = null
let origin = ''

const json = (res, status, body) => { const s = JSON.stringify(body); res.writeHead(status, { 'content-type': 'application/json' }); res.end(s) }
const readBody = (req) => new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))) })
const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer /, '')
function authed(req, res) {
  const t = bearer(req)
  if (!t || t !== currentToken) { if (t) seen.staleUse++; json(res, 401, { error: 'Não autorizado' }); return false }
  seen.tokens.add(t)
  return true
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const p = url.pathname
  seen.requests.push(`${req.method} ${p}`)
  const body = await readBody(req)
  try {
    if (req.method === 'POST' && p === '/api/integrations/pair/start') {
      const b = JSON.parse(body.toString())
      assert.equal(b.platform, 'archicad'); assert.ok(b.deviceName.includes('Archicad'))
      return json(res, 200, { deviceId: DEVICE_ID, deviceSecret: DEVICE_SECRET, userCode: 'K7QM-4XD2', verificationUrl: `${origin}/integrations/pair`, expiresIn: 600, pollInterval: 1 })
    }
    if (req.method === 'POST' && p === '/api/integrations/pair/claim') {
      const b = JSON.parse(body.toString())
      assert.equal(b.deviceId, DEVICE_ID); assert.equal(b.deviceSecret, DEVICE_SECRET)
      assert.ok(!req.headers.authorization, 'claim must be anonymous')
      if (++seen.claims < 2) return json(res, 200, { status: 'pending' })
      currentToken = 'access-1'
      // already inside the client's 90 s renewal window -> forces a /refresh before the first authed call
      return json(res, 200, { status: 'ready', accessToken: currentToken, expiresAt: Math.floor(Date.now() / 1000) + 30, userEmail: 'e2e@spacenode.test' })
    }
    if (req.method === 'POST' && p === '/api/integrations/pair/refresh') {
      const b = JSON.parse(body.toString())
      assert.equal(b.deviceSecret, DEVICE_SECRET)
      seen.refreshes++
      currentToken = 'access-' + (1 + seen.refreshes)
      return json(res, 200, { accessToken: currentToken, expiresAt: Math.floor(Date.now() / 1000) + 3600 })
    }
    if (req.method === 'GET' && p === '/api/integrations/session') {
      if (!authed(req, res)) return
      return json(res, 200, { ok: true, auth: 'bearer', user: { id: 'u1', email: 'e2e@spacenode.test' }, balance: { totalBalance: 120 }, theme: 'dark' })
    }
    if (req.method === 'GET' && p === '/api/integrations/catalog') { if (!authed(req, res)) return; return json(res, 200, catalog) }
    if (req.method === 'POST' && p === '/api/uploads/sign') {
      if (!authed(req, res)) return
      const b = JSON.parse(body.toString()); seen.signs.push(b)
      return json(res, 200, { bucket: 'space-mestres', key: 'render/source/u1/e2e.png', token: 'tok', uploadUrl: `${origin}/storage/upload/sign/space-mestres/render/source/u1/e2e.png?token=signed` })
    }
    if (req.method === 'PUT' && p.startsWith('/storage/upload/sign/')) {
      assert.ok(!req.headers.authorization, 'signed upload must not carry the bearer')
      seen.uploads.push({ bytes: body, contentType: req.headers['content-type'] })
      return json(res, 200, { Key: 'ok' })
    }
    if (req.method === 'POST' && p === '/api/generate') {
      if (!authed(req, res)) return
      const b = JSON.parse(body.toString()); seen.generates.push(b)
      return json(res, 200, { outputUrl: `${origin}/files/out.png?sig=1`, previewUrl: `${origin}/files/out.png?sig=1`, originalUrl: `${origin}/files/in.png`, renderId: RENDER_ID, nodesCharged: 10, totalBalance: 110, fidelityWarning: false, seed: 42 })
    }
    if (req.method === 'GET' && p === '/files/out.png') { assert.ok(!req.headers.authorization, 'download must not carry the bearer'); res.writeHead(200, { 'content-type': 'image/png' }); return res.end(renderPng) }
    json(res, 404, { error: 'not found ' + p })
  } catch (e) { json(res, 500, { error: String(e && e.message) }) }
})

await new Promise((r) => server.listen(0, '127.0.0.1', r))
origin = `http://127.0.0.1:${server.address().port}`

// ── build + run the C++ client ────────────────────────────────────────────────
const exe = path.join(work, 'e2e_test')
const isMac = process.platform === 'darwin'
if (!isMac) { console.error('The e2e runner currently builds the macOS transport only; on Windows run it manually with platform/win.'); process.exit(2) }
const sources = ['core/Json.cpp', 'core/Util.cpp', 'core/ApiClient.cpp', 'core/Generation.cpp', 'core/Controller.cpp', 'platform/ConfiguredApiBaseUrl.cpp'].map((s) => path.join(root, s))
const build = spawnSync(process.env.CXX || 'clang++', ['-std=c++20', '-fobjc-arc', '-Wall', '-Wextra', '-Wno-unused-parameter', '-Werror', '-g', '-pthread',
  path.join(here, 'e2e_test.cpp'), ...sources, path.join(root, 'platform/mac/MacPlatform.mm'),
  '-framework', 'Foundation', '-framework', 'Security', '-framework', 'AppKit', '-o', exe], { stdio: 'inherit' })
assert.equal(build.status, 0, 'e2e client failed to build')

const picturesDir = path.join(work, 'pictures'); const tempDir = path.join(work, 'tmp'); fs.mkdirSync(tempDir)
const child = spawn(exe, [], { env: { ...process.env, SN_E2E_BASE_URL: origin, SN_E2E_PICTURES: picturesDir, SN_E2E_TEMP: tempDir, SN_E2E_CAPTURE_PNG: capturePath }, stdio: ['ignore', 'pipe', 'pipe'] })
let out = ''; child.stdout.on('data', (d) => { out += d; process.stdout.write(d) }); child.stderr.on('data', (d) => { out += d; process.stderr.write(d) })
const code = await new Promise((r) => child.on('exit', r))
server.close()

// ── server-side assertions ────────────────────────────────────────────────────
assert.equal(code, 0, 'e2e client reported failures')
assert.equal(seen.uploads.length, 1, 'exactly one signed upload')
assert.ok(seen.uploads[0].bytes.equals(capturePng), 'uploaded bytes are the captured file, untouched')
assert.equal(seen.uploads[0].contentType, 'image/png')
assert.equal(seen.signs.length, 1)
assert.deepEqual({ area: seen.signs[0].area, contentType: seen.signs[0].contentType, sizeBytes: seen.signs[0].sizeBytes }, { area: 'render-source', contentType: 'image/png', sizeBytes: capturePng.length })
assert.equal(seen.generates.length, 1, 'exactly one paid generation')
const g = seen.generates[0]
assert.equal(g.sourceKey, 'render/source/u1/e2e.png'); assert.equal(g.engine, 'vega'); assert.equal(g.resolution, 'hd')
assert.equal(g.fidelityLevel, 'maximum'); assert.equal(g.background, 'Preservar Original'); assert.deepEqual(g.sceneElements, ['Plantas'])
assert.equal(g.refinementText, 'piso de madeira clara'); assert.ok(!('imageBase64' in g))
assert.ok(seen.refreshes >= 1, 'token refresh path was exercised over real HTTP')
assert.equal(seen.staleUse, 0, 'no request used a rotated-out token')
assert.ok(!out.includes(DEVICE_SECRET) && !out.includes('access-1'), 'secrets never reach client output')
const savedPath = /SAVED_PATH=(.*)/.exec(out)?.[1]
assert.ok(savedPath && fs.readFileSync(savedPath).equals(renderPng), 'saved file is the rendered image, byte for byte')
const order = seen.requests.filter((r) => /uploads\/sign|storage\/upload|api\/generate/.test(r)).join(' > ')
assert.equal(order, 'POST /api/uploads/sign > PUT /storage/upload/sign/space-mestres/render/source/u1/e2e.png > POST /api/generate')
console.log('\nE2E OK —', seen.requests.length, 'requests;', 'refreshes:', seen.refreshes, '; work dir:', work)
fs.rmSync(work, { recursive: true, force: true })
