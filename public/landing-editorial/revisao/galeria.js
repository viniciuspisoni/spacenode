'use strict'

const byId = id => document.getElementById(id)
const collectionKey = 'spacenode:revisao-20261122:favoritas'
const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo',
})
const numberText = number => String(number).padStart(2, '0')
const reference = item => '#' + numberText(item.number)
let items = []
let onlyFavorites = false
let current = 0
let selected = new Set()
const cards = new Map()

function button(text, action) {
  const el = document.createElement('button')
  el.type = 'button'
  el.textContent = text
  el.addEventListener('click', action)
  return el
}

function imageSource(item) { return 'data:image/webp;base64,' + item.image }

function updatePick(el, number) {
  const picked = selected.has(number)
  el.setAttribute('aria-pressed', String(picked))
  el.setAttribute('aria-label', (picked ? 'Desmarcar' : 'Marcar') + ' imagem ' + numberText(number))
  el.textContent = picked ? 'Marcada' : 'Marcar'
}

function refresh() {
  byId('favorites').textContent = 'Favoritas (' + selected.size + ')'
  byId('favorites').setAttribute('aria-pressed', String(onlyFavorites))
  byId('all').setAttribute('aria-pressed', String(!onlyFavorites))
  byId('copy').disabled = !selected.size
  byId('empty').hidden = !onlyFavorites || selected.size > 0
  for (const [number, card] of cards) {
    card.root.hidden = onlyFavorites && !selected.has(number)
    updatePick(card.pick, number)
  }
  if (byId('viewer').open) updatePick(byId('pick'), items[current].number)
}

function toggle(number) {
  if (selected.has(number)) selected.delete(number)
  else selected.add(number)
  try { localStorage.setItem(collectionKey, JSON.stringify([...selected])) }
  catch { byId('notice').textContent = 'As escolhas ficam disponíveis enquanto esta página estiver aberta.' }
  byId('copy-text').hidden = true
  refresh()
}

function show(index) {
  current = index
  const item = items[index]
  byId('image-title').textContent = reference(item) + ' · ' + item.title
  byId('image-date').textContent = 'Gerada em ' + dateFormat.format(new Date(item.date))
  byId('large').src = imageSource(item)
  byId('large').alt = item.title
  updatePick(byId('pick'), item.number)
  const dialog = byId('viewer')
  if (!dialog.open) dialog.showModal()
}

function move(direction) {
  const visible = items.filter(item => !onlyFavorites || selected.has(item.number))
  if (!visible.length) { byId('viewer').close(); return }
  const active = visible.findIndex(item => item.number === items[current].number)
  const next = active < 0 ? (direction > 0 ? 0 : visible.length - 1) : (active + direction + visible.length) % visible.length
  show(visible[next].number - 1)
}

function addCard(item, index) {
  const root = document.createElement('article')
  const open = button('', () => show(index))
  open.className = 'open'
  open.setAttribute('aria-label', 'Ampliar ' + reference(item) + ' · ' + item.title)
  const img = document.createElement('img')
  img.src = imageSource(item)
  img.loading = index < 4 ? 'eager' : 'lazy'
  img.alt = item.title
  open.append(img)
  const title = document.createElement('h2')
  title.textContent = reference(item) + ' · ' + item.title
  const meta = document.createElement('div')
  meta.className = 'meta'
  const date = document.createElement('time')
  date.dateTime = item.date
  date.textContent = dateFormat.format(new Date(item.date))
  const pick = button('Marcar', () => toggle(item.number))
  meta.append(date, pick)
  root.append(open, title, meta)
  cards.set(item.number, {root, pick})
  byId('grid').append(root)
}

async function loadGallery() {
  const keyPart = location.hash.slice(1)
  const invalid = 'Abra o link completo da seleção privada enviado no chat.'
  if (!/^[A-Za-z0-9_-]{43}$/.test(keyPart)) { byId('loading').textContent = invalid; return }
  try {
    const rawKey = Uint8Array.from(atob(keyPart.replace(/-/g, '+').replace(/_/g, '/') + '='), char => char.charCodeAt(0))
    const key = await crypto.subtle.importKey('raw', rawKey, { name:'AES-GCM' }, false, ['decrypt'])
    const res = await fetch('/previa/imagens-recentes/dados', {cache:'no-store', referrerPolicy:'no-referrer'})
    if (!res.ok) throw Error('Galeria indisponível')
    const pack = new Uint8Array(await res.arrayBuffer())
    const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:pack.subarray(0,12)}, key, pack.subarray(12))
    items = JSON.parse(new TextDecoder().decode(plain))
    if (items.length !== 30 || items.some((item,i) => item.number !== i+1)) throw Error('Seleção inválida')
  } catch {
    byId('loading').textContent = 'Não foi possível abrir as imagens. Confira a conexão e reabra o link completo do chat.'
    return
  }
  try {
    const saved = JSON.parse(localStorage.getItem(collectionKey) || '[]')
    if (Array.isArray(saved)) selected = new Set(saved.filter(n => Number.isInteger(n) && n >= 1 && n <= items.length))
  } catch { /* A revisão também funciona sem armazenamento local. */ }
  items.forEach(addCard)
  byId('intro').textContent = '30 imagens geradas de 3 a 21 de novembro de 2026. Toque em uma foto para ampliar e marque suas favoritas.'
  byId('loading').hidden = true
  byId('gallery').hidden = false
  refresh()
}

byId('all').addEventListener('click', () => { onlyFavorites = false; refresh() })
byId('favorites').addEventListener('click', () => { onlyFavorites = true; refresh() })
byId('close').addEventListener('click', () => byId('viewer').close())
byId('pick').addEventListener('click', () => toggle(items[current].number))
byId('prev').addEventListener('click', () => move(-1))
byId('next').addEventListener('click', () => move(1))
byId('viewer').addEventListener('keydown', e => {
  if(e.key === 'ArrowLeft') move(-1)
  if(e.key === 'ArrowRight') move(1)
})
byId('copy').addEventListener('click', async () => {
  const message = 'Minhas imagens para a landing da SpaceNode: ' +
    [...selected].sort((a,b)=>a-b).map(n=>'#'+numberText(n)).join(', ')
  try {
    await navigator.clipboard.writeText(message)
    byId('notice').textContent = 'Números copiados. Você pode colar a seleção no chat.'
  } catch {
    const field = byId('copy-text')
    field.hidden = false
    field.value = message
    field.focus()
    field.select()
  }
})
loadGallery()
