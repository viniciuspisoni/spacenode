// Dev server paralelo com distDir separado (.next-preview) para não colidir
// com o lock por distDir do Next 16 (ver next.config.ts). Wrapper em Node para
// setar a env var de forma portável (cmd.exe, PowerShell e sh).
import { spawn } from 'node:child_process'

const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: { ...process.env, NEXT_DIST_DIR: '.next-preview' },
  }
)

child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : code ?? 0)
})
