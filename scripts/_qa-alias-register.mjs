// scripts/_qa-alias-register.mjs — registra o resolve-hook de QA (test-only).
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
register('./_qa-alias-hooks.mjs', pathToFileURL('./scripts/'))
