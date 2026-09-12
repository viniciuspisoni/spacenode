// A versão do plugin SketchUp vive em QUATRO lugares e todos precisam bater.
//
// Desde a 1.0.4 o plugin compara a própria VERSION com o `pluginLatest` do
// catálogo e avisa quem está atrasado. Isso transformou um drift cosmético em
// defeito visível na tela do arquiteto:
//
//   - anunciar 1.0.5 e publicar o .rbz da 1.0.4 → a pessoa baixa, instala,
//     continua na 1.0.4, e o aviso VOLTA PRA SEMPRE, apontando pra um
//     download que não muda nada;
//   - subir a VERSION do main.rb sem subir o plugin-release.ts → ninguém
//     nunca é avisado.
//
// O drift já aconteceu duas vezes neste projeto (a página serviu 0.4.0 com o
// .rbz em 0.5.0; o EXTENSION.version ficou preso em 0.2.0), nas duas por
// esquecimento humano. Este teste troca a disciplina manual por erro de build.
//
// O .rbz é lido de verdade (zip → main.rb → VERSION) porque o erro mais
// provável não é esquecer de editar um arquivo: é editar os três e esquecer
// de rodar `npm run package:sketchup`.

import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { PLUGIN_VERSION, PLUGIN_RBZ_PATH } from '@/lib/sketchup/plugin-release'

const RAIZ = path.dirname(fileURLToPath(new URL('.', import.meta.url)))
const ler = (rel: string) => readFileSync(path.join(RAIZ, rel), 'utf8')

/** Extrai UMA entrada de um zip (só o que o .rbz usa: store e deflate). */
function lerDoZip(zipPath: string, alvo: string): string {
  const buf = readFileSync(path.join(RAIZ, zipPath))

  // Fim do diretório central: assinatura 0x06054b50, varrendo de trás pra
  // frente (o comentário final tem tamanho variável).
  let eocd = -1
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error(`zip sem diretório central: ${zipPath}`)

  const total = buf.readUInt16LE(eocd + 10)
  let ponteiro = buf.readUInt32LE(eocd + 16)

  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(ponteiro) !== 0x02014b50) break
    const metodo = buf.readUInt16LE(ponteiro + 10)
    const comprimido = buf.readUInt32LE(ponteiro + 20)
    const nomeLen = buf.readUInt16LE(ponteiro + 28)
    const extraLen = buf.readUInt16LE(ponteiro + 30)
    const comentarioLen = buf.readUInt16LE(ponteiro + 32)
    const inicioLocal = buf.readUInt32LE(ponteiro + 42)
    const nome = buf.toString('utf8', ponteiro + 46, ponteiro + 46 + nomeLen)

    if (nome === alvo) {
      // O cabeçalho local repete nome/extra com tamanhos PRÓPRIOS — usar os
      // do diretório central aqui daria offset errado.
      const nomeLocal = buf.readUInt16LE(inicioLocal + 26)
      const extraLocal = buf.readUInt16LE(inicioLocal + 28)
      const dados = inicioLocal + 30 + nomeLocal + extraLocal
      const fatia = buf.subarray(dados, dados + comprimido)
      return (metodo === 0 ? fatia : inflateRawSync(fatia)).toString('utf8')
    }

    ponteiro += 46 + nomeLen + extraLen + comentarioLen
  }

  throw new Error(`entrada "${alvo}" não encontrada em ${zipPath}`)
}

const capturar = (texto: string, re: RegExp, onde: string) => {
  const achado = texto.match(re)
  if (!achado) throw new Error(`não achei a versão em ${onde}`)
  return achado[1]
}

const NO_MAIN_RB = /VERSION\s*=\s*'([\d.]+)'/
const NO_LOADER = /EXTENSION\.version\s*=\s*'([\d.]+)'/

describe('versão do plugin SketchUp', () => {
  it('main.rb declara a mesma versão que o plugin-release.ts', () => {
    const noFonte = capturar(ler('sketchup/spacenode/main.rb'), NO_MAIN_RB, 'sketchup/spacenode/main.rb')
    expect(noFonte).toBe(PLUGIN_VERSION)
  })

  it('spacenode.rb (registro da extensão) declara a mesma versão', () => {
    const noLoader = capturar(ler('sketchup/spacenode.rb'), NO_LOADER, 'sketchup/spacenode.rb')
    expect(noLoader).toBe(PLUGIN_VERSION)
  })

  // Este é o que evita a praga: o catálogo anuncia PLUGIN_VERSION, e o botão
  // de baixar aponta pro .rbz publicado. Se o pacote estiver velho, o aviso
  // reaparece a cada sessão pra sempre.
  it('o .rbz publicado em /downloads contém essa versão', () => {
    const empacotado = capturar(
      lerDoZip(`public${PLUGIN_RBZ_PATH}`, 'spacenode/main.rb'),
      NO_MAIN_RB,
      'public/downloads/spacenode-sketchup.rbz',
    )
    expect(empacotado).toBe(PLUGIN_VERSION)
  })

  it('o .rbz de dist/ está no mesmo ponto que o publicado', () => {
    const noDist = capturar(
      lerDoZip('dist/spacenode-sketchup.rbz', 'spacenode/main.rb'),
      NO_MAIN_RB,
      'dist/spacenode-sketchup.rbz',
    )
    expect(noDist).toBe(PLUGIN_VERSION)
  })
})
