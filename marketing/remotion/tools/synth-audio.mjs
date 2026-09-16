// Sintetiza a trilha e os efeitos da campanha como WAV 16-bit, 48 kHz.
// Tudo é gerado aqui, deterministicamente — nenhum sample de terceiros, nenhuma
// licença a conferir. A trilha é um bed instrumental minimal: pad grave em
// quintas, pulso surdo que cresce, e um brilho alto muito discreto.
//
//   node marketing/remotion/tools/synth-audio.mjs
//
// Saída: marketing/remotion/public/audio/*.wav
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const OUT = resolve(import.meta.dirname, '../public/audio');
const SR = 48000;

function wav(samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

// Ruído determinístico (LCG) — o mesmo arquivo em qualquer máquina.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; };
}

// Filtro passa-baixa de 1 polo, simples e suficiente para o timbre.
function lowpass(samples, cutoffHz) {
  const out = new Float32Array(samples.length);
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / SR;
  const a = dt / (rc + dt);
  let y = 0;
  for (let i = 0; i < samples.length; i++) { y += a * (samples[i] - y); out[i] = y; }
  return out;
}
function highpass(samples, cutoffHz) {
  const lp = lowpass(samples, cutoffHz);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] - lp[i];
  return out;
}

function env(t, a, d, s, r, dur) {
  if (t < 0) return 0;
  if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - s) * ((t - a) / d);
  if (t < dur - r) return s;
  if (t < dur) return s * (1 - (t - (dur - r)) / r);
  return 0;
}

// ---------------------------------------------------------------- trilha ----
// 84 BPM, em Ré menor: fundamental 73,4 Hz (D2). Pad em D2 + A2 (quinta) + D3.
function bed(durationSec, { rise = 0.7 } = {}) {
  const n = Math.floor(durationSec * SR);
  const out = new Float32Array(n);
  const bpm = 84;
  const beat = 60 / bpm;
  const f0 = 73.42;
  const noise = rng(7);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const p = t / durationSec;                      // progresso 0..1
    const swell = 0.55 + 0.45 * Math.min(1, p / rise); // cresce até 70% da peça
    // pad: três osciladores levemente desafinados por voz, senóide + um pouco de triângulo
    let pad = 0;
    for (const [f, g] of [[f0, 1], [f0 * 1.5, 0.55], [f0 * 2, 0.35]]) {
      for (const det of [-0.4, 0, 0.4]) {
        const ff = f * (1 + det / 100);
        const ph = 2 * Math.PI * ff * t;
        pad += g * (Math.sin(ph) * 0.8 + (2 / Math.PI) * Math.asin(Math.sin(ph)) * 0.2) / 3;
      }
    }
    pad *= 0.16 * (0.85 + 0.15 * Math.sin(2 * Math.PI * 0.07 * t)); // respiração lenta
    // pulso: toda semínima, um "thump" senoidal com pitch drop, mais presente com o tempo
    const tb = t % beat;
    const kick = Math.sin(2 * Math.PI * (52 + 40 * Math.exp(-tb * 18)) * tb) * Math.exp(-tb * 9);
    const kickGain = 0.22 * swell * (t > beat * 4 ? 1 : 0);
    // brilho: senóide alta muito discreta que aparece só no último terço
    const shimmer = Math.sin(2 * Math.PI * f0 * 8 * t) * Math.sin(2 * Math.PI * 0.31 * t) * 0.012 * Math.max(0, p - 0.55) / 0.45;
    // ar: ruído filtrado muito baixo dá corpo de "sala"
    const air = noise() * 0.06;
    out[i] = pad * swell + kick * kickGain + shimmer + air;
  }
  const filtered = lowpass(out, 2200);
  // fade in 0,3 s / fade out 0,8 s
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const fi = Math.min(1, t / 0.3);
    const fo = Math.min(1, (durationSec - t) / 0.8);
    filtered[i] *= fi * fo;
  }
  return filtered;
}

// --------------------------------------------------------------- efeitos ----
function click() {
  const dur = 0.06, n = Math.floor(dur * SR);
  const out = new Float32Array(n);
  const noise = rng(11);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] = noise() * Math.exp(-t * 140) * 0.9 + Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 90) * 0.35;
  }
  return highpass(out, 900);
}

function tick() {
  const dur = 0.04, n = Math.floor(dur * SR);
  const out = new Float32Array(n);
  const noise = rng(13);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] = noise() * Math.exp(-t * 260) * 0.7 + Math.sin(2 * Math.PI * 2600 * t) * Math.exp(-t * 200) * 0.3;
  }
  return highpass(out, 1400);
}

function whoosh() {
  const dur = 0.55, n = Math.floor(dur * SR);
  const raw = new Float32Array(n);
  const noise = rng(17);
  for (let i = 0; i < n; i++) raw[i] = noise();
  // varredura de filtro: sobe e desce
  const out = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const p = t / dur;
    const cutoff = 300 + 2600 * Math.sin(Math.PI * p);
    const a = (1 / SR) / (1 / (2 * Math.PI * cutoff) + 1 / SR);
    y += a * (raw[i] - y);
    out[i] = y * Math.sin(Math.PI * p) * 0.9;
  }
  return highpass(out, 180);
}

function impact() {
  const dur = 0.9, n = Math.floor(dur * SR);
  const out = new Float32Array(n);
  const noise = rng(19);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 44 + 70 * Math.exp(-t * 14);
    out[i] = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 4.2) * 0.95 + noise() * Math.exp(-t * 40) * 0.12;
  }
  return lowpass(out, 900);
}

function riser(dur = 1.2) {
  const n = Math.floor(dur * SR);
  const raw = new Float32Array(n);
  const noise = rng(23);
  for (let i = 0; i < n; i++) raw[i] = noise();
  const out = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const p = t / dur;
    const cutoff = 200 + 3000 * p * p;
    const a = (1 / SR) / (1 / (2 * Math.PI * cutoff) + 1 / SR);
    y += a * (raw[i] - y);
    out[i] = y * p * p * 0.7;
  }
  return highpass(out, 120);
}

await mkdir(OUT, { recursive: true });
const files = {
  'bed-40s.wav': bed(40, { rise: 0.7 }),
  'bed-24s.wav': bed(24, { rise: 0.65 }),
  'bed-18s.wav': bed(18, { rise: 0.6 }),
  'click.wav': click(),
  'tick.wav': tick(),
  'whoosh.wav': whoosh(),
  'impact.wav': impact(),
  'riser.wav': riser(),
};
for (const [name, samples] of Object.entries(files)) {
  await writeFile(join(OUT, name), wav(samples));
  console.log(name, (samples.length / SR).toFixed(2) + 's');
}
