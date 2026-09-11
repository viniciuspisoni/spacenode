/**
 * Sessão de captura para os Reels de produto — SEM senha, SEM formulário.
 *
 *   node marketing/scripts/produto/session.mjs            # cria/renova o storageState
 *   node marketing/scripts/produto/session.mjs --check    # só diz se o estado atual serve
 *
 * Como funciona: o service role gera um magic link para a conta do DONO
 * (INTERNAL_STAFF_EMAILS / SESSION_EMAIL), o token é trocado por sessão via
 * verifyOtp e o próprio @supabase/ssr escreve os cookies no formato exato que
 * o app espera (chunk, base64, nome com o ref do projeto). Nenhuma credencial
 * é digitada em campo nenhum e nada é impresso no console.
 *
 * O storageState tem TOKENS: fica no TEMP da sessão, nunca no repositório.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

const REPO = resolve(import.meta.dirname, '../../..');

// .env.local sem depender de dotenv (o repo não carrega env em script solto).
export async function loadEnv() {
  const raw = await readFile(join(REPO, '.env.local'), 'utf8');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

export const STATE_PATH = join(
  process.env.SPACENODE_CAPTURE_DIR ||
    join(process.env.TEMP || '/tmp', 'spacenode-produto'),
  'storage-state.json',
);

export const TARGET = process.env.SPACENODE_TARGET || 'https://spacenode.app';

/** Cookies do app para a conta do dono, no formato do @supabase/ssr. */
export async function mintCookies() {
  const env = await loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;
  const email =
    process.env.SPACENODE_SESSION_EMAIL ||
    (env.INTERNAL_STAFF_EMAILS || '').split(',')[0].trim();

  if (!url || !anon || !serviceRole) throw new Error('.env.local sem SUPABASE_URL / ANON / SERVICE_ROLE');
  if (!email) throw new Error('sem e-mail da conta (SPACENODE_SESSION_EMAIL ou INTERNAL_STAFF_EMAILS)');

  const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw new Error(`generateLink falhou: ${linkErr.message}`);

  const plain = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: verified, error: vErr } = await plain.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (vErr) throw new Error(`verifyOtp falhou: ${vErr.message}`);
  const session = verified.session;
  if (!session) throw new Error('verifyOtp não devolveu sessão');

  // O próprio cliente SSR decide nomes/chunks dos cookies — nada de adivinhar formato.
  const jar = new Map();
  const ssr = createBrowserClient(url, anon, {
    cookies: {
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  await ssr.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });

  const domain = new URL(TARGET).hostname;
  const secure = new URL(TARGET).protocol === 'https:';
  const cookies = [...jar.entries()]
    .filter(([, value]) => value)
    .map(([name, value]) => ({
      name,
      value,
      domain,
      path: '/',
      httpOnly: false,
      secure,
      sameSite: 'Lax',
      expires: Math.floor(session.expires_at || 0) || -1,
    }));

  return { cookies, userId: session.user.id, expiresAt: session.expires_at };
}

export async function writeState() {
  const { cookies, userId, expiresAt } = await mintCookies();
  await mkdir(dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify({ cookies, origins: [] }, null, 1), 'utf8');
  return { userId, expiresAt, path: STATE_PATH };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const check = process.argv.includes('--check');
  if (check) {
    if (!existsSync(STATE_PATH)) {
      console.log('sem estado — rode sem --check');
      process.exit(1);
    }
    const st = JSON.parse(await readFile(STATE_PATH, 'utf8'));
    const exp = Math.max(...st.cookies.map((c) => c.expires || 0));
    console.log(`estado com ${st.cookies.length} cookies, expira em ${exp > 0 ? new Date(exp * 1000).toISOString() : 'sessão'}`);
    process.exit(0);
  }
  const { userId, expiresAt } = await writeState();
  console.log(`sessão pronta para user ${userId.slice(0, 8)}… (exp ${expiresAt})`);
  console.log(`estado em ${STATE_PATH}`);
}
