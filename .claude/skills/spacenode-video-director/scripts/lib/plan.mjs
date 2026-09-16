/**
 * plan.mjs — núcleo compartilhado do pipeline do SpaceNode Video Director.
 *
 * O `plan.json` é a FONTE ÚNICA da peça. Estimativa, aprovação, geração e
 * entrega leem todos o mesmo arquivo — não existe redigitação de shot list.
 *
 * Exporta: repoRoot, acervoRoot, expand, loadPlan, planHash, validate,
 *          shotsToEstimate, fmtUSD.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Sobe até achar a raiz do repo (package.json + marketing/). */
export function repoRoot() {
  let dir = HERE;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'marketing'))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  // fallback: 5 níveis acima de scripts/lib/
  return resolve(HERE, '..', '..', '..', '..', '..');
}

/** Mesma convenção de reel-spec.mjs / cinema.mjs. */
export function acervoRoot(repo = repoRoot()) {
  return (process.env.SPACENODE_ACERVO || join(repo, '..', 'acervo')).replace(/\\/g, '/');
}

/** Expande $ACERVO e $REPO em qualquer string. */
export function expand(text, repo = repoRoot()) {
  return String(text)
    .replaceAll('$ACERVO', acervoRoot(repo))
    .replaceAll('$REPO', repo.replace(/\\/g, '/'));
}

/**
 * Carrega o plano já com os caminhos expandidos.
 * Devolve { plan, planPath, dir, repo, raw }.
 */
export function loadPlan(planPath) {
  const abs = isAbsolute(planPath) ? planPath : resolve(process.cwd(), planPath);
  if (!existsSync(abs)) throw new Error(`plano não encontrado: ${abs}`);
  const repo = repoRoot();
  const raw = readFileSync(abs, 'utf8');
  let plan;
  try {
    plan = JSON.parse(expand(raw, repo));
  } catch (err) {
    throw new Error(`plan.json inválido (JSON malformado): ${err.message}`);
  }
  return { plan, planPath: abs, dir: dirname(abs), repo, raw };
}

/** Ordena chaves recursivamente para o hash ser estável. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, k) => {
        acc[k] = canonical(value[k]);
        return acc;
      }, {});
  }
  return value;
}

/**
 * Hash do plano — cobre SÓ o que determina geração paga e custo.
 *
 * Consequência deliberada: mexer em objetivo, caption ou motion design NÃO
 * invalida uma aprovação (não custa dinheiro). Mexer em prompt, endpoint,
 * duração, resolução ou nº de takes INVALIDA — é outra geração, outro custo.
 * É a forma mecânica da LEI 2: "um 'pode gerar' aprovou aquele plano, não
 * qualquer plano."
 */
export function planHash(plan) {
  const material = {
    takes: plan.takes ?? 2,
    shots: (plan.shots || [])
      .filter((s) => s.generate)
      .map((s) => ({
        id: s.id,
        source: s.source ?? null,
        generate: {
          endpoint: s.generate.endpoint,
          inputs: s.generate.inputs ?? {},
          seconds: s.generate.seconds ?? null,
          res: s.generate.res ?? null,
          aspect: s.generate.aspect ?? null,
          fps: s.generate.fps ?? null,
          images: s.generate.images ?? null,
          count: s.generate.count ?? 1,
          takes: s.generate.takes ?? null,
        },
      })),
  };
  return createHash('sha256').update(JSON.stringify(canonical(material))).digest('hex').slice(0, 12);
}

const NUM = (v) => typeof v === 'number' && Number.isFinite(v);
const near = (a, b) => Math.abs(a - b) < 0.001;

/**
 * Valida o plano contra as regras de references/plan-schema.md.
 * Devolve { errors, warnings } — errors bloqueiam geração.
 */
export function validate(plan) {
  const errors = [];
  const warnings = [];
  const E = (m) => errors.push(m);
  const W = (m) => warnings.push(m);

  if (!plan.slug) E('campo "slug" ausente (vira o nome da pasta de entrega)');
  else if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(plan.slug))
    W(`slug "${plan.slug}" foge do padrão AAAA-MM-DD-nome-em-kebab`);

  if (!plan.objective) E('campo "objective" ausente');
  if (!plan.concept) E('campo "concept" ausente');
  if (plan.kind && !['organic', 'paid'].includes(plan.kind))
    E(`"kind" deve ser "organic" ou "paid" (veio "${plan.kind}")`);
  if (!plan.kind) W('campo "kind" ausente — assumindo "organic" (sem bloco de performance)');

  if (!NUM(plan.duration) || plan.duration <= 0) E('campo "duration" ausente ou não numérico (segundos)');

  const fmt = plan.format || {};
  if (!NUM(fmt.width) || !NUM(fmt.height)) E('"format.width" e "format.height" são obrigatórios');
  if (!NUM(fmt.fps)) W('"format.fps" ausente — o reel-kit entrega 30fps');

  const shots = plan.shots;
  if (!Array.isArray(shots) || shots.length === 0) {
    E('"shots" ausente ou vazio');
    return { errors, warnings };
  }

  const seen = new Set();
  let cursor = 0;

  shots.forEach((s, i) => {
    const at = `shot[${i}]${s.id ? ` (${s.id})` : ''}`;

    if (!s.id) E(`${at}: campo "id" ausente`);
    else if (seen.has(s.id)) E(`${at}: id duplicado "${s.id}"`);
    else seen.add(s.id);

    // --- timeline contígua ---
    if (!NUM(s.start) || !NUM(s.end)) {
      E(`${at}: "start" e "end" numéricos são obrigatórios`);
    } else {
      if (s.end <= s.start) E(`${at}: "end" (${s.end}) precisa ser maior que "start" (${s.start})`);
      if (!near(s.start, cursor))
        E(`${at}: buraco/sobreposição na timeline — começa em ${s.start}s, o anterior terminou em ${cursor}s`);
      cursor = s.end;
    }

    // --- LEI 2: model explícito em TODO shot, inclusive os grátis ---
    if (!s.model) {
      E(`${at}: campo "model" ausente — use "reel-kit" quando não houver IA (é assim que o custo fica auditável)`);
    }

    // --- source real, nunca plausível ---
    if (s.source) {
      if (!existsSync(s.source)) E(`${at}: source não existe no disco — ${s.source}`);
    } else if (s.model && s.model !== 'card') {
      W(`${at}: sem "source" — confirme que é um card de texto puro`);
    }

    // --- coerência model <-> generate ---
    const isEndpoint = typeof s.model === 'string' && s.model.includes('/');
    if (isEndpoint && !s.generate) {
      E(`${at}: model "${s.model}" é um endpoint pago mas não há bloco "generate"`);
    }
    if (!isEndpoint && s.generate) {
      E(`${at}: tem bloco "generate" mas model é "${s.model}" — model precisa ser o endpoint_id`);
    }

    if (s.generate) {
      const g = s.generate;
      if (!g.endpoint) E(`${at}.generate: campo "endpoint" ausente`);
      else if (isEndpoint && g.endpoint !== s.model)
        E(`${at}: model "${s.model}" e generate.endpoint "${g.endpoint}" divergem`);

      if (!g.inputs || typeof g.inputs !== 'object' || Object.keys(g.inputs).length === 0)
        E(`${at}.generate: "inputs" ausente ou vazio (os parâmetros exatos do schema do endpoint)`);

      if (g.seconds == null && g.images == null)
        E(`${at}.generate: sem "seconds" nem "images" — o estimador não consegue calcular a unidade de cobrança`);

      // @source precisa ter de onde sair
      const usesSource = JSON.stringify(g.inputs || {}).includes('@source');
      if (usesSource && !s.source) E(`${at}.generate: inputs usam "@source" mas o shot não tem "source"`);

      // A base de custo tem que ser o que REALMENTE vai ser enviado, senão a
      // estimativa mente. Ex.: seconds=4 com inputs.duration="5" paga 5 e estima 4.
      const DURATION_KEYS = ['duration', 'duration_seconds', 'seconds', 'video_length'];
      for (const key of DURATION_KEYS) {
        const sent = g.inputs?.[key];
        if (sent == null) continue;
        const asNumber = Number(sent);
        if (!Number.isFinite(asNumber)) continue;
        if (NUM(g.seconds) && !near(asNumber, g.seconds))
          E(`${at}.generate: "seconds" é ${g.seconds} mas inputs.${key} envia ${sent} — a estimativa sairia errada. "seconds" é o que você PAGA.`);
      }

      // não dá pra preencher 4s de timeline com um take de 3s
      if (NUM(g.seconds) && NUM(s.start) && NUM(s.end) && g.seconds < s.end - s.start - 0.001)
        E(`${at}: take de ${g.seconds}s não preenche os ${(s.end - s.start).toFixed(2)}s que o shot ocupa na timeline`);

      const takes = g.takes ?? plan.takes ?? 2;
      if (takes < 2)
        W(`${at}: takes=${takes} — a doutrina manda estimar com pelo menos 2 (o 1º take de arquitetura reprova com frequência)`);

      if (NUM(g.seconds) && g.seconds > 6)
        W(`${at}: take de ${g.seconds}s — acima de ~6s a geometria escorrega. Prefira 4–6s e monte dois shots.`);
    }
  });

  // --- soma bate com a duração declarada ---
  if (NUM(plan.duration) && !near(cursor, plan.duration))
    E(`a soma dos shots dá ${cursor.toFixed(2)}s mas "duration" declara ${plan.duration}s`);

  if (shots.length && NUM(shots[0].start) && !near(shots[0].start, 0))
    E(`o primeiro shot começa em ${shots[0].start}s — tem que começar em 0`);

  // --- regra de hook para peça paga ---
  if (plan.kind === 'paid') {
    if (!plan.hook) E('peça paga sem "hook" — o hook dos primeiros 2s manda em tudo');
    const inFirst2s = shots.filter((s) => NUM(s.start) && s.start < 2);
    if (inFirst2s.length && !inFirst2s.some((s) => s.text))
      W('peça paga sem texto nos primeiros 2s — o benefício precisa passar com o som desligado');
    if (!plan.cta) W('peça paga sem "cta" declarado');
  }

  if (!plan.assembly?.kit) W('"assembly.kit" ausente — declare reel-kit, cinema-kit ou remotion');
  else if (!['reel-kit', 'cinema-kit', 'remotion'].includes(plan.assembly.kit))
    E(`"assembly.kit" inválido: ${plan.assembly.kit}`);

  return { errors, warnings };
}

/** Converte os shots pagos do plano no formato que o estimador consome. */
export function shotsToEstimate(plan) {
  return (plan.shots || [])
    .filter((s) => s.generate)
    .map((s) => ({
      id: s.id,
      endpoint: s.generate.endpoint,
      seconds: s.generate.seconds,
      res: s.generate.res,
      aspect: s.generate.aspect ?? plan.format?.aspect?.replace(':', 'x'),
      fps: s.generate.fps,
      images: s.generate.images,
      count: s.generate.count,
      takes: s.generate.takes,
    }));
}

export const fmtUSD = (n) => `US$ ${n.toFixed(4)}`;
