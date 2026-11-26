// Página local de rotulagem humana (cega). Gera data/labels.html, que abre
// direto do disco: original × render lado a lado, "Entregaria ao cliente?",
// motivos, e a revisão dos inventários dos leitores. Os nomes dos motores e
// leitores ficam escondidos e a ordem é embaralhada por caso. Os rótulos ficam
// no localStorage do navegador; "Exportar" baixa o labels.json, que vai para
// tests/bench3/data/labels.json. As chaves do labels.json são ids cegos
// (blindId); o relatório converte de volta.

import type { ReadContract } from './contract'

export interface LabelRender { key: string; caseName: string; png: string }
export interface LabelRead { key: string; caseName: string; items: ReadContract['inventario'] }
export interface LabelCase { name: string; input: string; renders: LabelRender[]; reads: LabelRead[] }

export interface Labels {
  version: 1
  renders: Record<string, { accept: boolean; reasons: string[]; note: string }>
  reads: Record<string, { wrongIds: number[]; missing: number }>
}

export const REASONS = ['geometria', 'camera', 'material', 'objeto_sumiu', 'objeto_novo', 'luz', 'artefato', 'pouco_realista'] as const

/**
 * Id cego de um render ou leitura. A página e os arquivos de imagem que ela
 * mostra usam só este id: nem o DOM nem o nome do arquivo revelam motor ou
 * leitor. O relatório recalcula o id a partir da chave real para cruzar.
 */
export function blindId(key: string): string {
  let a = 2166136261, b = 5381
  for (const ch of key) { a = Math.imul(a ^ ch.charCodeAt(0), 16777619) >>> 0; b = (Math.imul(b, 33) ^ ch.charCodeAt(0)) >>> 0 }
  return a.toString(36) + b.toString(36)
}

/** Embaralhamento determinístico (mesma ordem a cada geração da página). */
export function shuffleSeeded<T>(items: T[], seed: string): T[] {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0
    const j = h % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export function buildLabelsHtml(cases: LabelCase[]): string {
  const blocks = cases.map(c => {
    const renders = shuffleSeeded(c.renders, c.name).map((r, i) => `
      <div class="render" data-key="${esc(blindId(r.key))}">
        <div class="tag">Render ${i + 1}</div>
        <img loading="lazy" src="${esc(r.png)}" alt="render ${i + 1}">
        <div class="row">
          <button class="yes">Entregaria</button><button class="no">Não entregaria</button>
        </div>
        <div class="reasons">${REASONS.map(x => `<label><input type="checkbox" value="${x}">${x.replace('_', ' ')}</label>`).join('')}</div>
        <input class="note" placeholder="nota (opcional)">
      </div>`).join('')
    const reads = shuffleSeeded(c.reads, `${c.name}:reads`).map((r, i) => `
      <details class="read" data-key="${esc(blindId(r.key))}">
        <summary>Leitor ${String.fromCharCode(65 + i)} — ${r.items.length} itens</summary>
        <p class="hint">Marque os itens errados ou inventados.</p>
        ${r.items.map(it => `<label class="item"><input type="checkbox" value="${it.id}"> #${it.id}${it.critico ? ' ★' : ''} ${esc(it.tipo)}: ${esc(it.descricao)} — <em>${esc(it.material)}</em></label>`).join('')}
        <label class="missing">Elementos importantes que faltaram: <input type="number" min="0" value="0"></label>
      </details>`).join('')
    return `
    <section class="case" id="${esc(c.name)}">
      <h2>${esc(c.name)}</h2>
      <div class="grid"><div class="orig"><div class="tag">Original</div><img loading="lazy" src="${esc(c.input)}" alt="original"></div>${renders}</div>
      ${reads ? `<div class="reads"><h3>Leituras do print</h3>${reads}</div>` : ''}
    </section>`
  }).join('')

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Bench Renderizar 3.0 — rotulagem</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: light dark; --bg:#111; --fg:#eee; --muted:#999; --card:#1c1c1c; --ok:#2f7d4f; --bad:#8a3434; }
  @media (prefers-color-scheme: light) { :root { --bg:#f5f5f3; --fg:#111; --muted:#666; --card:#fff; } }
  body { margin:0; font:14px/1.45 system-ui, sans-serif; background:var(--bg); color:var(--fg); }
  header { position:sticky; top:0; z-index:2; display:flex; gap:12px; align-items:center; padding:10px 16px; background:var(--card); border-bottom:1px solid #8883; }
  header .count { margin-left:auto; color:var(--muted); }
  button { font:inherit; padding:6px 12px; border-radius:8px; border:1px solid #8886; background:transparent; color:inherit; cursor:pointer; }
  .case { padding:16px; border-bottom:1px solid #8883; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:12px; }
  .grid img { width:100%; border-radius:8px; display:block; cursor:zoom-in; }
  .render, .orig { background:var(--card); padding:8px; border-radius:12px; border:2px solid transparent; }
  .render.accepted { border-color:var(--ok); } .render.rejected { border-color:var(--bad); }
  .render.accepted .yes { background:var(--ok); color:#fff; } .render.rejected .no { background:var(--bad); color:#fff; }
  .tag { color:var(--muted); font-size:12px; margin-bottom:4px; }
  .row { display:flex; gap:8px; margin:8px 0; }
  .reasons { display:flex; flex-wrap:wrap; gap:4px 10px; font-size:12px; color:var(--muted); }
  .note { width:100%; margin-top:6px; box-sizing:border-box; padding:4px 6px; border-radius:6px; border:1px solid #8885; background:transparent; color:inherit; }
  .read { background:var(--card); border-radius:10px; padding:8px 12px; margin:8px 0; }
  .item { display:block; padding:2px 0; } .hint { color:var(--muted); margin:4px 0; }
  .missing input { width:60px; }
  dialog { padding:0; border:0; background:transparent; } dialog img { max-width:96vw; max-height:94vh; }
</style></head><body>
<header><strong>Bench Renderizar 3.0</strong><span>Entregaria este render ao cliente do arquiteto?</span>
<span class="count" id="count"></span><button id="export">Exportar labels.json</button></header>
${blocks}
<dialog id="zoom"><img alt="zoom"></dialog>
<script>
const KEY = 'bench3-labels-v1';
const state = JSON.parse(localStorage.getItem(KEY) || '{"version":1,"renders":{},"reads":{}}');
const save = () => { localStorage.setItem(KEY, JSON.stringify(state)); count(); };
function count() {
  const total = document.querySelectorAll('.render').length;
  const done = Object.keys(state.renders).length;
  document.getElementById('count').textContent = done + ' de ' + total + ' renders rotulados';
}
document.querySelectorAll('.render').forEach(el => {
  const k = el.dataset.key;
  const get = () => state.renders[k] || (state.renders[k] = { accept: false, reasons: [], note: '' });
  const paint = () => { const v = state.renders[k]; el.classList.toggle('accepted', !!v && v.accept); el.classList.toggle('rejected', !!v && !v.accept); };
  const v0 = state.renders[k];
  if (v0) { el.querySelectorAll('.reasons input').forEach(i => i.checked = v0.reasons.includes(i.value)); el.querySelector('.note').value = v0.note; }
  paint();
  el.querySelector('.yes').onclick = () => { get().accept = true; paint(); save(); };
  el.querySelector('.no').onclick = () => { get().accept = false; paint(); save(); };
  el.querySelectorAll('.reasons input').forEach(i => i.onchange = () => {
    const v = get(); v.reasons = [...el.querySelectorAll('.reasons input:checked')].map(x => x.value); if (v.reasons.length) v.accept = false; paint(); save();
  });
  el.querySelector('.note').oninput = e => { get().note = e.target.value; save(); };
});
document.querySelectorAll('.read').forEach(el => {
  const k = el.dataset.key;
  const v0 = state.reads[k];
  if (v0) { el.querySelectorAll('.item input').forEach(i => i.checked = v0.wrongIds.includes(Number(i.value))); el.querySelector('.missing input').value = v0.missing; }
  const upd = () => { state.reads[k] = { wrongIds: [...el.querySelectorAll('.item input:checked')].map(x => Number(x.value)), missing: Number(el.querySelector('.missing input').value) || 0 }; save(); };
  el.querySelectorAll('input').forEach(i => i.onchange = upd);
});
const zoom = document.getElementById('zoom');
document.querySelectorAll('.grid img').forEach(img => img.onclick = () => { zoom.querySelector('img').src = img.src; zoom.showModal(); });
zoom.onclick = () => zoom.close();
document.getElementById('export').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
  a.download = 'labels.json'; a.click();
};
count();
</script></body></html>`
}
