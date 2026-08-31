// Sobe um arquivo real para fal.storage e tenta um modelo leve (Kling 5s).
// Se o upload funcionar mas a fila travar com URL real, confirma que o
// problema é provider-side, não da imagem.

const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '.env.local');
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) { let v = (m[2] || '').trim(); if ((v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1); process.env[m[1]] = v; }
});

const { fal } = require('@fal-ai/client');
fal.config({ credentials: process.env.FAL_KEY });

(async () => {
  // Procura uma imagem pequena (jpg/png) em qualquer subdir conhecido pra usar como teste
  const candidates = [
    'public/billing-subscriber-preview.html',
  ];
  // Usa qualquer png/jpg de public/
  function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.(jpe?g|png|webp)$/i.test(e.name) && fs.statSync(p).size < 2_000_000) out.push(p);
    }
    return out;
  }
  const imgs = walk('public');
  if (imgs.length === 0) { console.log('Sem imagem em public/'); return; }
  const imgPath = imgs[0];
  console.log('Usando imagem:', imgPath, 'size=', fs.statSync(imgPath).size);

  const buf = fs.readFileSync(imgPath);
  const ext = path.extname(imgPath).slice(1).toLowerCase();
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  const file = new File([buf], path.basename(imgPath), { type: mime });

  console.log('Subindo para fal.storage...');
  const t0 = Date.now();
  let url;
  try {
    url = await fal.storage.upload(file);
    console.log(`Upload OK em ${Date.now() - t0}ms:`, url);
  } catch (e) {
    console.log('Upload FAIL:', e?.status, e?.message, JSON.stringify(e?.body));
    return;
  }

  // Tenta o modelo mais barato/rápido — Kling 5s
  console.log('\nSubmitting Kling 5s...');
  const t1 = Date.now();
  let request_id;
  try {
    const r = await fal.queue.submit('fal-ai/kling-video/v2.5-turbo/pro/image-to-video', {
      input: { image_url: url, prompt: 'subtle camera motion, architectural visualization', duration: '5', cfg_scale: 0.75 },
    });
    request_id = r.request_id;
    console.log(`Submit OK em ${Date.now() - t1}ms — request_id=${request_id}`);
  } catch (e) {
    console.log('Submit FAIL:', e?.status, e?.message, JSON.stringify(e?.body));
    return;
  }

  // Polling 3 min
  const start = Date.now();
  while (Date.now() - start < 180_000) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const s = await fal.queue.status('fal-ai/kling-video/v2.5-turbo/pro/image-to-video', { requestId: request_id, logs: true });
      const elapsed = Math.round((Date.now() - start) / 1000);
      console.log(`${elapsed}s status=${s.status} queue_pos=${s.queue_position ?? '-'}`);
      if (s.status === 'COMPLETED') {
        const out = await fal.queue.result('fal-ai/kling-video/v2.5-turbo/pro/image-to-video', { requestId: request_id });
        console.log('COMPLETED:', JSON.stringify(out.data).slice(0, 300));
        return;
      }
      if (s.status === 'FAILED' || s.status === 'CANCELLED') {
        console.log('Job não terminou bem:', s.status);
        return;
      }
    } catch (e) {
      console.log('Status check err:', e?.status, e?.message);
    }
  }
  console.log('Timeout após 3min em queue/in_progress.');
})();
