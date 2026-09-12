/**
 * Máscara de dado privado nas capturas do app.
 *
 * `docs/marketing/prohibited-content.md` §6 proíbe nome, e-mail, saldo em nodes e
 * nome de projeto identificável em material público — e as telas mais bonitas do
 * app (Painel, Histórico, Renderizar) são justamente as que mostram os quatro.
 *
 * A máscara aqui NÃO é tarja preta: cada retângulo é pintado com a cor do fundo
 * ao redor (amostrada da própria imagem), então o que sobra parece uma tela sem
 * aquele dado, não uma tela censurada. Tarja preta em cima de UI clara denuncia
 * que havia algo ali — e num filme isso vira o assunto do plano.
 *
 *   node marketing/scripts/produto/mascarar.mjs regras.json           # aplica
 *   node marketing/scripts/produto/mascarar.mjs regras.json --check   # só lista o que faria
 *
 * regras.json:
 * {
 *   "saida": "masked",                     // subpasta irmã de cada arquivo (default "masked")
 *   "grupos": [
 *     {
 *       "arquivos": ["$REPO/.../renderizar-wide/01-painel-inteiro-vazio.png"],
 *       "porque": "saldo em nodes + avatar do dono",
 *       "rects": [
 *         { "x": 780, "y": 50, "w": 380, "h": 90, "amostra": [1400, 90] },
 *         { "x": 30,  "y": 2020, "w": 100, "h": 110, "cor": "#ffffff" }
 *       ]
 *     }
 *   ]
 * }
 *
 * `amostra: [x, y]` pega a cor daquele pixel da imagem original (o jeito seguro:
 * a UI tem tons diferentes por painel). `cor` fixa quando a amostra não serve.
 */
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { ffmpeg } from '../lib/tools.mjs';

const REPO = resolve(import.meta.dirname, '../../..');
const argv = process.argv.slice(2);
const check = argv.includes('--check');
const regrasPath = argv.find((a) => !a.startsWith('--'));

if (!regrasPath) {
  console.error('uso: node marketing/scripts/produto/mascarar.mjs regras.json [--check]');
  process.exit(1);
}

const regras = JSON.parse((await readFile(regrasPath, 'utf8')).replaceAll('$REPO', REPO.replace(/\\/g, '/')));
const saidaNome = regras.saida || 'masked';

/** Cor de um pixel: ffmpeg recorta 1×1 num PPM e a gente lê os três bytes. */
async function amostrar(arquivo, x, y) {
  const tmp = join(process.env.TEMP || '/tmp', `px-${Math.abs(x * 7919 + y)}.ppm`);
  await ffmpeg(['-i', arquivo, '-vf', `crop=1:1:${x}:${y}`, '-f', 'image2', '-pix_fmt', 'rgb24', '-frames:v', '1', tmp]);
  const buf = await readFile(tmp);
  // PPM binário (P6): cabeçalho "P6\n<w> <h>\n255\n" seguido dos bytes RGB.
  const header = buf.subarray(0, 32).toString('latin1');
  const m = header.match(/^P6\s+\d+\s+\d+\s+\d+\s/);
  const off = m ? m[0].length : buf.length - 3;
  const [r, g, b] = [buf[off], buf[off + 1], buf[off + 2]];
  return `0x${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

let total = 0;
for (const grupo of regras.grupos) {
  for (const arquivo of grupo.arquivos) {
    if (!existsSync(arquivo)) { console.error(`✗ não existe: ${arquivo}`); process.exit(1); }
    const destDir = join(dirname(arquivo), saidaNome);
    const dest = join(destDir, basename(arquivo));

    // `grade` repete o mesmo retângulo numa matriz — é o caso do selo de autoria
    // que aparece em CADA miniatura do Histórico: 18 retângulos idênticos que
    // ninguém vai escrever à mão sem errar um.
    const rects = [];
    for (const r of grupo.rects) {
      if (!r.grade) { rects.push(r); continue; }
      const { cols = 1, rows = 1, dx = 0, dy = 0 } = r.grade;
      for (let c = 0; c < cols; c++) {
        for (let f = 0; f < rows; f++) rects.push({ ...r, x: r.x + c * dx, y: r.y + f * dy });
      }
    }

    // Dois modos, e a escolha entre eles é visual, não técnica:
    //   pintar   → preenche com a cor do fundo. Certo sobre superfície LISA (barra de topo,
    //              fundo de sidebar): o dado some e não fica marca.
    //   desfoque → borra a região. Certo sobre superfície TEXTURADA (uma miniatura de render,
    //              um piso de concreto): ali a cor chapada vira um quadrado cinza que denuncia
    //              a censura mais do que o dado denunciava. Foi o que aconteceu no primeiro
    //              teste com os selos de autoria do Histórico.
    //   clonar   → copia um pedaço LIMPO da vizinhança por cima. É o único modo que some de
    //              verdade sobre conteúdo texturado e de alto contraste (um selo escuro num
    //              piso claro): pintar deixa quadrado chapado e desfocar só espalha a mancha,
    //              porque o borrão preserva a luminância média do que estava ali.
    const pintar = rects.filter((r) => (r.modo || 'pintar') === 'pintar');
    const borrar = rects.filter((r) => r.modo === 'desfoque' || r.modo === 'clonar');

    const filtros = [];
    for (const r of pintar) {
      const cor = r.cor
        ? r.cor.replace('#', '0x')
        : r.amostra ? await amostrar(arquivo, r.amostra[0], r.amostra[1]) : '0x000000';
      filtros.push(`drawbox=x=${r.x}:y=${r.y}:w=${r.w}:h=${r.h}:color=${cor}@1:t=fill`);
    }

    let cadeia;
    if (borrar.length) {
      // split → borra cada recorte → devolve por cima, em cadeia.
      const partes = [`[0:v]${filtros.length ? filtros.join(',') + ',' : ''}split=${borrar.length + 1}${['[base]', ...borrar.map((_, i) => `[s${i}]`)].join('')}`];
      borrar.forEach((r, i) => {
        if (r.modo === 'clonar') {
          const [dx, dy] = r.de || [r.w + 10, 0];
          partes.push(`[s${i}]crop=${r.w}:${r.h}:${r.x + dx}:${r.y + dy}[b${i}]`);
        } else {
          partes.push(`[s${i}]crop=${r.w}:${r.h}:${r.x}:${r.y},boxblur=${r.raio || 12}:${r.passes || 3}[b${i}]`);
        }
      });
      let cur = '[base]';
      borrar.forEach((r, i) => {
        const lbl = i === borrar.length - 1 ? '[out]' : `[o${i}]`;
        partes.push(`${cur}[b${i}]overlay=${r.x}:${r.y}${lbl}`);
        cur = lbl;
      });
      cadeia = partes.join(';');
    }

    console.log(`${check ? "·" : "→"} ${basename(dirname(arquivo))}/${basename(arquivo)}  ${pintar.length} pintado(s) + ${borrar.length} desfocado(s)  ${grupo.porque || ""}`);
    if (!check) {
      await mkdir(destDir, { recursive: true });
      if (cadeia) await ffmpeg(['-i', arquivo, '-filter_complex', cadeia, '-map', '[out]', dest]);
      else await ffmpeg(['-i', arquivo, '-vf', filtros.join(','), dest]);
      console.log(`    ✓ ${dest}`);
    }
    total++;
  }
}
console.log(`\n${check ? 'simulação' : 'pronto'}: ${total} arquivo(s)`);
