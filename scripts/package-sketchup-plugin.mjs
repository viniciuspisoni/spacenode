// Empacota o plugin SketchUp (.rbz) em macOS/Linux — irmão do
// package-sketchup-plugin.ps1, que continua sendo o caminho no Windows.
//
//   node scripts/package-sketchup-plugin.mjs            → dist/ + public/downloads/
//   node scripts/package-sketchup-plugin.mjs --out X    → só em X (conferência)
//   node scripts/package-sketchup-plugin.mjs --check    → só valida versões, não gera
//   node scripts/package-sketchup-plugin.mjs --verify   → confere que o .rbz publicado == sketchup/ (entrada a entrada)
//
// O que ele garante (cada item já falhou uma vez na história do plugin):
// - as TRÊS versões batem: sketchup/spacenode.rb (EXTENSION.version),
//   sketchup/spacenode/main.rb (VERSION) e lib/sketchup/plugin-release.ts
//   (PLUGIN_VERSION) — o plugin compara a própria VERSION com a do catálogo;
// - o zip usa separador "/" (o SketchUp do macOS descompacta "\" errado) e a
//   raiz tem exatamente spacenode.rb + spacenode/ (exigência do Extension
//   Warehouse);
// - dist/ e public/downloads/ recebem o MESMO binário — o site serve o de
//   public/downloads; só gerar o dist/ já deixou a página anunciando uma
//   versão enquanto o download entregava outra.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outArg = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const checkOnly = args.includes('--check');
const verifyOnly = args.includes('--verify');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}
function versionOf(rel, re) {
  const m = read(rel).match(re);
  if (!m) throw new Error(`versão não encontrada em ${rel}`);
  return m[1];
}

const versions = {
  'sketchup/spacenode.rb': versionOf('sketchup/spacenode.rb', /EXTENSION\.version\s*=\s*'([^']+)'/),
  'sketchup/spacenode/main.rb': versionOf('sketchup/spacenode/main.rb', /^\s*VERSION\s*=\s*'([^']+)'/m),
  'lib/sketchup/plugin-release.ts': versionOf('lib/sketchup/plugin-release.ts', /PLUGIN_VERSION\s*=\s*'([^']+)'/),
};
const distinct = new Set(Object.values(versions));
if (distinct.size !== 1) {
  console.error('Versões divergentes — alinhe as três antes de empacotar:');
  for (const [file, v] of Object.entries(versions)) console.error(`  ${v.padEnd(8)} ${file}`);
  process.exit(1);
}
const version = [...distinct][0];
console.log(`versão ${version} sincronizada nos três arquivos`);
if (checkOnly) process.exit(0);

// --verify: o .rbz servido pelo site precisa ser exatamente o fonte do commit —
// já aconteceu de o zip carregar um dialog.html de antes da última edição.
if (verifyOnly) {
  const { createHash } = await import('node:crypto');
  const md5 = (buf) => createHash('md5').update(buf).digest('hex');
  let bad = 0;
  for (const rel of ['dist/spacenode-sketchup.rbz', 'public/downloads/spacenode-sketchup.rbz']) {
    const rbz = path.join(ROOT, rel);
    if (!fs.existsSync(rbz)) { console.error(`${rel}: ausente`); bad++; continue; }
    const entries = execFileSync('unzip', ['-Z1', rbz], { encoding: 'utf8' }).trim().split('\n');
    const expected = ['spacenode.rb', ...walk(path.join(ROOT, 'sketchup', 'spacenode')).map(p => 'spacenode/' + path.relative(path.join(ROOT, 'sketchup', 'spacenode'), p).split(path.sep).join('/'))].sort();
    const got = [...entries].sort();
    // Entradas a mais no zip são toleradas como aviso: o Extension Signature
    // Portal injeta o arquivo de assinatura no .rbz, e é o ASSINADO que vai
    // pro site. Entradas do fonte que faltam ou diferem continuam erro.
    const extra = got.filter(e => !expected.includes(e));
    const missing = expected.filter(e => !got.includes(e));
    if (extra.length) console.warn(`${rel}: entradas além do fonte (assinatura?): ${extra.join(', ')}`);
    if (missing.length) {
      console.error(`${rel}: entradas do fonte ausentes no zip: ${missing.join(', ')}`);
      bad++;
      continue;
    }
    for (const entry of expected) {
      const inZip = execFileSync('unzip', ['-p', rbz, entry]);
      const onDisk = fs.readFileSync(path.join(ROOT, 'sketchup', entry));
      if (md5(inZip) !== md5(onDisk)) { console.error(`${rel}: ${entry} difere do fonte`); bad++; }
    }
    if (!bad) console.log(`${rel}: ${entries.length} entradas iguais ao fonte`);
  }
  process.exit(bad ? 1 : 0);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
}

const entry = path.join(ROOT, 'sketchup', 'spacenode.rb');
const dir = path.join(ROOT, 'sketchup', 'spacenode');
if (!fs.existsSync(entry) || !fs.existsSync(dir)) throw new Error('sketchup/spacenode.rb ou sketchup/spacenode/ ausente');

const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'spacenode-rbz-'));
fs.copyFileSync(entry, path.join(staging, 'spacenode.rb'));
fs.cpSync(dir, path.join(staging, 'spacenode'), { recursive: true });

const built = path.join(staging, 'spacenode-sketchup.rbz');
// -X: sem atributos extras do macOS; -r: recursivo; -D: sem entradas de
// diretório (o .ps1 também só grava arquivos). O zip do sistema grava "/".
execFileSync('zip', ['-q', '-X', '-r', '-D', built, 'spacenode.rb', 'spacenode'], { cwd: staging, stdio: 'inherit' });

// Sanidade: toda entrada com "/", raiz = spacenode.rb + spacenode/, nada de
// .DS_Store ou arquivo de editor dentro do pacote.
const listing = execFileSync('unzip', ['-Z1', built], { encoding: 'utf8' }).trim().split('\n');
const bad = listing.filter(e => e.includes('\\'));
if (bad.length) throw new Error(`entrada com separador inválido: ${bad[0]}`);
const roots = new Set(listing.map(e => e.split('/')[0]));
if (![...roots].every(r => r === 'spacenode.rb' || r === 'spacenode') || !roots.has('spacenode.rb')) {
  throw new Error(`raiz do .rbz inesperada: ${[...roots].join(', ')}`);
}
const junk = listing.filter(e => /(^|\/)(\.DS_Store|Thumbs\.db|.*\.swp|.*~)$/.test(e));
if (junk.length) throw new Error(`lixo dentro do pacote: ${junk.join(', ')}`);

const targets = outArg
  ? [path.resolve(outArg, 'spacenode-sketchup.rbz')]
  : [path.join(ROOT, 'dist', 'spacenode-sketchup.rbz'), path.join(ROOT, 'public', 'downloads', 'spacenode-sketchup.rbz')];
for (const target of targets) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(built, target);
  console.log(`${path.relative(ROOT, target)} — ${listing.length} entradas, ${fs.statSync(target).size} bytes`);
}
fs.rmSync(staging, { recursive: true, force: true });
