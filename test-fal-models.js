// Smoke test em paralelo: Veo 3.1 + Kling 2.5 Turbo Pro + Seedance 2.0.
// Roda só fal.queue.submit para confirmar qual endpoint está congestionado
// sem esperar a geração inteira terminar.

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

const { fal } = require('@fal-ai/client');
fal.config({ credentials: process.env.FAL_KEY });

const IMG = 'https://v3.fal.media/files/penguin/zXTKbQ1lMmS2EVj7cWtht_image.webp';

async function probe(name, endpoint, input) {
  const t0 = Date.now();
  try {
    const { request_id } = await fal.queue.submit(endpoint, { input });
    console.log(`[${name}] SUBMITTED request_id=${request_id} in ${Date.now() - t0}ms`);

    // Polling leve a cada 5s, até 90s
    const start = Date.now();
    while (Date.now() - start < 90_000) {
      await new Promise(r => setTimeout(r, 5000));
      const s = await fal.queue.status(endpoint, { requestId: request_id, logs: true });
      const elapsed = Math.round((Date.now() - start) / 1000);
      console.log(`[${name}] ${elapsed}s status=${s.status} queue_pos=${s.queue_position ?? '-'}`);
      if (s.status === 'COMPLETED') return { name, ok: true, elapsed };
      if (s.status === 'FAILED' || s.status === 'CANCELLED') return { name, ok: false, status: s.status };
    }
    return { name, ok: false, timeout: true };
  } catch (e) {
    console.log(`[${name}] SUBMIT ERROR status=${e?.status} msg=${e?.message}`);
    return { name, ok: false, submitError: e?.message };
  }
}

(async () => {
  const probes = [
    probe('veo3.1', 'fal-ai/veo3.1/image-to-video', {
      image_url: IMG, prompt: 'slow dolly forward, architectural visualization',
      duration: '4s', resolution: '1080p', aspect_ratio: 'auto', generate_audio: false,
    }),
    probe('kling2.5', 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video', {
      image_url: IMG, prompt: 'slow dolly forward, architectural visualization',
      duration: '5', cfg_scale: 0.75,
    }),
    probe('seedance2.0', 'bytedance/seedance-2.0/image-to-video', {
      image_url: IMG, prompt: 'slow dolly forward, architectural visualization',
      duration: '5', resolution: '1080p', aspect_ratio: 'auto', generate_audio: false,
    }),
  ];
  const results = await Promise.all(probes);
  console.log('\n=== RESUMO ===');
  results.forEach(r => console.log(JSON.stringify(r)));
})();
