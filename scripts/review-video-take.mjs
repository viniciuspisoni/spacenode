// Local visual review preparation. Never generates video, calls providers or
// charges Nodes. Invoke from the repository root; requires ffmpeg and ffprobe.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import sharp from 'sharp'
import { TAKE_REVIEW_CRITERIA, assessArchitecturalTakeReview } from '../lib/video/takeReview.ts'

const args = process.argv.slice(2)
function option(name) {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}
if (option('--assess')) {
  const review = JSON.parse(await readFile(resolve(option('--assess')), 'utf8'))
  const result = assessArchitecturalTakeReview(review)
  console.log(JSON.stringify(result, null, 2))
  process.exit(result.verdict === 'approved' ? 0 : result.verdict === 'rejected' ? 1 : 2)
}
if (!option('--video') || !option('--reference') || !option('--out')) {
  console.log('Prepare: node scripts/review-video-take.mjs --video clip.mp4 --reference source.png --out /tmp/take-review [--end final.png]')
  console.log('Assess: node scripts/review-video-take.mjs --assess /tmp/take-review/review.json')
  process.exit(args.includes('--help') ? 0 : 2)
}
const video = resolve(option('--video'))
const reference = resolve(option('--reference'))
const output = resolve(option('--out'))
await mkdir(output, { recursive: true })
const probe = JSON.parse(execFileSync('ffprobe', [
  '-v', 'error', '-show_entries', 'format=duration:stream=width,height,codec_type', '-of', 'json', video,
], { encoding: 'utf8' }))
const duration = Number(probe.format?.duration)
const stream = probe.streams?.find(value => value.codec_type === 'video')
if (!Number.isFinite(duration) || duration <= 0 || !stream) throw new Error('Invalid video duration or stream.')

const fractions = [0, .25, .5, .75, 1]
const panels = [{ path: reference, label: 'REFERENCE' }]
const samples = []
for (const fraction of fractions) {
  const requestedSeconds = Math.max(0, duration * fraction - (fraction === 1 ? .12 : 0))
  const filename = `frame-${Math.round(fraction * 100)}.png`
  const path = resolve(output, filename)
  const extract = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'info', '-y',
    '-i', video, '-vf', `select=gte(t\\,${requestedSeconds}),showinfo`,
    '-frames:v', '1', '-fps_mode', 'passthrough', '-update', '1', path], { encoding: 'utf8' })
  if (extract.error) throw extract.error
  if (extract.status !== 0) throw new Error(extract.stderr)
  const timestamp = extract.stderr.match(/pts_time:([\d.-]+)/)?.[1]
  if (timestamp === undefined) throw new Error('No frame at the requested timestamp.')
  const seconds = Number(timestamp)
  samples.push({ fraction, requestedSeconds, seconds, file: filename })
  panels.push({ path, label: `${Math.round(fraction * 100)}% / ${seconds.toFixed(2)}s` })
}
if (option('--end')) panels.push({ path: resolve(option('--end')), label: 'END REFERENCE' })
const width = 480, height = 300, labelHeight = 30
const tiles = []
for (let index = 0; index < panels.length; index++) {
  const panel = panels[index]
  const tile = await sharp(panel.path).resize(width, height, { fit: 'contain', background: '#14171b' }).png().toBuffer()
  const left = index % 2 * width, top = Math.floor(index / 2) * (height + labelHeight)
  tiles.push({ input: tile, left, top })
  tiles.push({ input: Buffer.from(`<svg width="480" height="30"><rect width="480" height="30" fill="#14171b"/><text x="12" y="21" font-size="15" fill="white" font-family="Arial">${panel.label}</text></svg>`), left, top: top + height })
}
await sharp({ create: { width: width * 2, height: Math.ceil(panels.length / 2) * (height + labelHeight),
  channels: 3, background: '#14171b' } }).composite(tiles).png().toFile(resolve(output, 'contact-sheet.png'))
await writeFile(resolve(output, 'samples.json'), JSON.stringify({
  video, reference, duration, resolution: { width: stream.width, height: stream.height }, samples,
  warning: 'Samples prepare inspection; they are not a visual pass. Watch the full clip and compare the reference.',
}, null, 2))
await writeFile(resolve(output, 'review.json'), JSON.stringify({
  watchedFullClip: false, comparedReference: false, reviewedFractions: [],
  criteria: Object.fromEntries(TAKE_REVIEW_CRITERIA.map(key => [key, { verdict: 'unverified', evidence: '' }])),
}, null, 2), { flag: 'wx' })
console.log(JSON.stringify({ output, verdict: 'inconclusive', duration, samples: samples.length }))
