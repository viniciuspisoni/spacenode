/**
 * B-ROLL do filme — dois modos, e a diferença entre eles é uma regra de honestidade,
 * não um detalhe técnico.
 *
 * 1. COM `imagem`  → image-to-video. Anima um render que JÁ É output real do SPACENODE,
 *    pelo mesmo motor que o módulo Animar usa (Veo 3.1 via fal, ver
 *    `lib/video/adapters/falAdapter.ts`). É o produto usando o produto — pode ser
 *    legendado como resultado da plataforma.
 *
 * 2. SÓ COM `prompt` → text-to-video. Imagem gerada do zero, para AMBIENTAÇÃO de marca:
 *    matéria, luz, textura. O `BRIEF.md` §4 proíbe usar IA externa para fingir output
 *    do produto, então um clipe destes NUNCA pode ser legendado, sugerido ou montado
 *    de forma que o espectador entenda "isto foi feito no SPACENODE". Se ficar ambíguo,
 *    o clipe está errado.
 *
 *   node marketing/scripts/video/broll.mjs plano.json --dry     # só estima o custo
 *   node marketing/scripts/video/broll.mjs plano.json           # gera de verdade
 *   node marketing/scripts/video/broll.mjs plano.json --so id   # gera um clipe só
 *
 * Plano:
 * {
 *   "destino": "marketing/output/2026-09-09-filme/broll",
 *   "tetoUsd": 15,
 *   "clipes": [
 *     { "id": "fachada-abre", "imagem": "$REPO/marketing/renders/depois/casa.jpg",
 *       "prompt": "...", "duracao": 8, "aspecto": "16:9" }
 *   ]
 * }
 *
 * Guardas: teto de gasto em dólar (aborta antes de estourar), livro-caixa em
 * `gasto.json` no destino, e nenhum clipe é regerado se o mp4 já existe.
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { fal } from '@fal-ai/client';

const REPO = resolve(import.meta.dirname, '../../..');

// US$/s confirmado em lib/video/models.ts (Veo 3.1, 1080p, sem áudio) e na página do modelo na fal.
// Dois endpoints: com imagem de base é image-to-video (anima um render REAL do produto); sem imagem
// é text-to-video (ambientação de marca, gerada do zero — nunca legendada como output do produto).
const MODELO_I2V = 'fal-ai/veo3.1/image-to-video';
const MODELO_T2V = 'fal-ai/veo3.1';
const USD_POR_SEGUNDO = 0.20;

/** .env.local não é carregado automaticamente por um script solto. */
async function carregarEnv() {
  const txt = await readFile(join(REPO, '.env.local'), 'utf8').catch(() => '');
  for (const linha of txt.split('\n')) {
    const m = linha.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const argv = process.argv.slice(2);
const has = (n) => argv.includes(n);
const arg = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);

const planoPath = argv.find((a) => !a.startsWith('--') && a !== arg('--so'));
if (!planoPath) {
  console.error('uso: node marketing/scripts/video/broll.mjs plano.json [--dry] [--so <id>]');
  process.exit(1);
}

await carregarEnv();
const plano = JSON.parse((await readFile(planoPath, 'utf8')).replaceAll('$REPO', REPO.replace(/\\/g, '/')));
const destino = resolve(REPO, plano.destino);
const teto = plano.tetoUsd ?? 15;
const soId = arg('--so');
const clipes = plano.clipes.filter((c) => !soId || c.id === soId);

await mkdir(destino, { recursive: true });
const livroPath = join(destino, 'gasto.json');
const livro = existsSync(livroPath) ? JSON.parse(await readFile(livroPath, 'utf8')) : { gastoUsd: 0, clipes: [] };

// ---------------------------------------------------------------- orçamento --
let estimado = 0;
const fila = [];
for (const c of clipes) {
  const mp4 = join(destino, `${c.id}.mp4`);
  if (existsSync(mp4)) {
    console.log(`· ${c.id.padEnd(22)} JÁ EXISTE — pulando (${mp4})`);
    continue;
  }
  if (c.imagem && !existsSync(c.imagem)) {
    console.error(`✗ ${c.id}: imagem base não existe: ${c.imagem}`);
    process.exit(1);
  }
  if (!c.imagem && !c.prompt) {
    console.error(`✗ ${c.id}: sem "imagem" e sem "prompt" — não dá para gerar nada`);
    process.exit(1);
  }
  const custo = (c.duracao || 8) * USD_POR_SEGUNDO;
  estimado += custo;
  fila.push({ ...c, custo, mp4 });
}

console.log('');
console.log(`modelo      ${MODELO_T2V} (texto) · ${MODELO_I2V} (imagem)`);
console.log(`clipes      ${fila.length} a gerar (de ${clipes.length} no plano)`);
console.log(`estimativa  US$ ${estimado.toFixed(2)}`);
console.log(`já gasto    US$ ${livro.gastoUsd.toFixed(2)}`);
console.log(`teto        US$ ${teto.toFixed(2)}`);
for (const c of fila) {
  console.log(`  · ${c.id.padEnd(22)} ${c.duracao || 8}s  US$ ${c.custo.toFixed(2)}  ${c.imagem ? basename(c.imagem) : 'texto→vídeo'}`);
}
console.log('');

if (livro.gastoUsd + estimado > teto) {
  console.error(`✗ abortado: US$ ${(livro.gastoUsd + estimado).toFixed(2)} passaria do teto de US$ ${teto.toFixed(2)}.`);
  console.error('  Corte clipes do plano, encurte durações, ou suba "tetoUsd" conscientemente.');
  process.exit(1);
}
if (has('--dry')) { console.log('--dry: nada foi gerado.'); process.exit(0); }
if (!fila.length) { console.log('nada a fazer.'); process.exit(0); }
if (!process.env.FAL_KEY) { console.error('✗ FAL_KEY ausente no .env.local'); process.exit(1); }

fal.config({ credentials: process.env.FAL_KEY });

// ------------------------------------------------------------------ geração --
for (const c of fila) {
  const dur = c.duracao || 8;
  const modelo = c.imagem ? MODELO_I2V : MODELO_T2V;
  console.log(`→ ${c.id}  (${dur}s, US$ ${c.custo.toFixed(2)}, ${c.imagem ? 'imagem→vídeo' : 'texto→vídeo'})`);

  const input = {
    prompt:          c.prompt,
    duration:        `${dur}s`,
    resolution:      '1080p',
    aspect_ratio:    c.aspecto || '16:9',
    generate_audio:  false,
    negative_prompt: c.negativo || 'texto, letras, marca d’água, logotipo, pessoas, mãos, rostos, distorção, deformação de geometria',
  };

  if (c.imagem) {
    // A imagem base precisa estar acessível por URL: sobe pro storage do próprio fal.
    const bytes = await readFile(c.imagem);
    const nome = basename(c.imagem);
    const tipo = nome.endsWith('.png') ? 'image/png' : 'image/jpeg';
    input.image_url = await fal.storage.upload(new File([bytes], nome, { type: tipo }));
    console.log(`   base: ${nome} → ${String(input.image_url).slice(0, 72)}…`);
  }

  const t0 = process.hrtime.bigint();
  const resultado = await fal.subscribe(modelo, {
    input,
    logs: false,
    onQueueUpdate: (u) => { if (u.status === 'IN_PROGRESS') process.stdout.write('.'); },
  });
  const segundos = Number(process.hrtime.bigint() - t0) / 1e9;
  process.stdout.write('\n');

  const url = resultado?.data?.video?.url;
  if (!url) {
    console.error(`✗ ${c.id}: resposta sem vídeo — ${JSON.stringify(resultado?.data).slice(0, 400)}`);
    process.exit(1);
  }

  const resp = await fetch(url);
  if (!resp.ok) { console.error(`✗ ${c.id}: download falhou (${resp.status})`); process.exit(1); }
  await writeFile(c.mp4, Buffer.from(await resp.arrayBuffer()));
  const tam = (await stat(c.mp4)).size;

  livro.gastoUsd += c.custo;
  livro.clipes.push({ id: c.id, modelo, duracao: dur, custoUsd: c.custo, imagem: c.imagem, prompt: c.prompt, geracaoS: Math.round(segundos), arquivo: c.mp4 });
  await writeFile(livroPath, JSON.stringify(livro, null, 2), 'utf8');

  console.log(`   ✓ ${c.mp4}  ${(tam / 1e6).toFixed(1)} MB  em ${Math.round(segundos)}s`);
  console.log(`   acumulado: US$ ${livro.gastoUsd.toFixed(2)} / ${teto.toFixed(2)}`);
}

console.log(`\n✓ ${fila.length} clipe(s). Gasto total do plano: US$ ${livro.gastoUsd.toFixed(2)}. Livro-caixa: ${livroPath}`);
