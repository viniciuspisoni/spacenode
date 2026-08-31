// Repro isolado da chamada FAL Seedance 2.0 (mesmo input que falAdapter.ts monta).
// Roda: node test-seedance.js
// Objetivo: confirmar se o erro vem do FAL ou de outro lugar do pipeline.

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (m) {
      let v = (m[2] || '').trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  });
}

if (!process.env.FAL_KEY) { console.error('FAL_KEY ausente'); process.exit(1); }

(async () => {
  const { fal } = require('@fal-ai/client');
  fal.config({ credentials: process.env.FAL_KEY });

  const TEST_IMAGE = 'https://v3.fal.media/files/penguin/zXTKbQ1lMmS2EVj7cWtht_image.webp';
  const input = {
    image_url:      TEST_IMAGE,
    prompt:         'very slow dolly forward through living room, gentle parallax, controlled motion. Cinematic architectural visualization.',
    duration:       '10',
    resolution:     '1080p',
    aspect_ratio:   'auto',
    generate_audio: false,
  };

  console.log('--- INPUT ---'); console.log(JSON.stringify(input, null, 2));
  console.log('--- MODEL --- bytedance/seedance-2.0/image-to-video');
  console.log('Iniciando fal.subscribe (pode levar 60-180s)...\n');

  try {
    const r = await fal.subscribe('bytedance/seedance-2.0/image-to-video', {
      input,
      logs: true,
      onQueueUpdate: u => console.log('[queue]', u.status, u.logs ? u.logs.map(l => l.message).join(' | ') : ''),
    });
    console.log('\n--- OK ---'); console.log(JSON.stringify(r.data, null, 2));
  } catch (e) {
    console.log('\n--- FAIL ---');
    console.log('status :', e?.status);
    console.log('message:', e?.message);
    console.log('body   :', JSON.stringify(e?.body ?? null, null, 2));
    console.log('full   :', e);
  }
})();
