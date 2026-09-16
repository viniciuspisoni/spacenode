import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * ffmpeg/ffprobe instalados via `winget install Gyan.FFmpeg` não entram no PATH
 * da sessão atual. Resolve na ordem: env var → PATH → diretório de pacotes do winget.
 */
function resolveBinary(name, envVar) {
  if (process.env[envVar] && existsSync(process.env[envVar])) return process.env[envVar];

  const local = process.env.LOCALAPPDATA;
  if (local) {
    const pkgRoot = join(local, 'Microsoft', 'WinGet', 'Packages');
    if (existsSync(pkgRoot)) {
      for (const dir of readdirSync(pkgRoot).filter((d) => d.startsWith('Gyan.FFmpeg'))) {
        for (const build of readdirSync(join(pkgRoot, dir))) {
          const candidate = join(pkgRoot, dir, build, 'bin', `${name}.exe`);
          if (existsSync(candidate)) return candidate;
        }
      }
    }
  }

  return name; // deixa o PATH resolver
}

export const FFMPEG = resolveBinary('ffmpeg', 'FFMPEG');
export const FFPROBE = resolveBinary('ffprobe', 'FFPROBE');

export async function run(bin, args) {
  try {
    return await execFileAsync(bin, args, { maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    const detail = (err.stderr || '').split('\n').slice(-25).join('\n');
    throw new Error(`${bin} falhou (exit ${err.code}):\n${detail}`);
  }
}

export const ffmpeg = (args) => run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

export async function probe(file) {
  const { stdout } = await run(FFPROBE, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,pix_fmt,nb_frames,codec_name',
    '-show_entries', 'format=duration,size',
    '-of', 'json',
    file,
  ]);
  return JSON.parse(stdout);
}
