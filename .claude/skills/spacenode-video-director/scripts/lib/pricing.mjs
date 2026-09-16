/**
 * pricing.mjs — cálculo de custo a partir de `genmedia pricing` ao vivo.
 *
 * Comando GRÁTIS. Nada aqui gera mídia. Compartilhado por estimate-cost.mjs
 * (antes do portão) e run-plan.mjs (ledger durante a execução), pra estimativa
 * e realizado saírem exatamente da mesma conta.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

const RES = { '480p': 480, '720p': 720, '1080p': 1080, '4k': 2160 };

const ASPECT = {
  '9x16': [9, 16], '16x9': [16, 9], '1x1': [1, 1], '4x5': [4, 5],
  '5x4': [5, 4], '21x9': [21, 9], '3x4': [3, 4], '4x3': [4, 3],
};

export function dimensions(res = '720p', aspect = '9x16') {
  const explicit = /^(\d+)x(\d+)$/.exec(String(res));
  if (explicit) return [Number(explicit[1]), Number(explicit[2])];

  const shortSide = RES[res];
  if (!shortSide) throw new Error(`res desconhecida: ${res}`);
  const ratio = ASPECT[String(aspect).replace(':', 'x')];
  if (!ratio) throw new Error(`aspect desconhecido: ${aspect}`);

  const [a, b] = ratio;
  // o lado menor recebe a resolução nominal
  return a <= b
    ? [shortSide, Math.round((shortSide * b) / a)]
    : [Math.round((shortSide * a) / b), shortSide];
}

const priceCache = new Map();

export async function priceOf(endpoint) {
  if (priceCache.has(endpoint)) return priceCache.get(endpoint);
  const { stdout } = await exec('genmedia', ['pricing', endpoint, '--json'], {
    maxBuffer: 8 * 1024 * 1024,
  });
  const parsed = JSON.parse(stdout);
  const entry = parsed?.prices?.[0];
  if (!entry) throw new Error(`sem preço para ${endpoint}`);
  const price = {
    unitPrice: entry.unit_price,
    unit: entry.unit,
    currency: entry.currency || 'USD',
  };
  priceCache.set(endpoint, price);
  return price;
}

/** Custo de UMA chamada do shot. Devolve { cost, basis } ou { error }. */
export function costOf(shot, price) {
  const unit = String(price.unit).toLowerCase();
  const seconds = shot.seconds != null ? Number(shot.seconds) : null;
  const fps = shot.fps != null ? Number(shot.fps) : 24;

  if (unit === 'seconds' || unit === 'second') {
    if (seconds == null) return { error: 'endpoint cobra por segundo mas o shot não tem seconds=' };
    return { cost: price.unitPrice * seconds, basis: `${seconds}s x ${price.unitPrice}/s` };
  }

  if (unit.includes('token')) {
    if (seconds == null) return { error: 'endpoint cobra por token mas o shot não tem seconds=' };
    const [w, h] = dimensions(shot.res || '720p', shot.aspect || '9x16');
    const per = unit.includes('1000') ? 1000 : unit.includes('million') ? 1e6 : 1;
    const tokens = (w * h * fps * seconds) / 1024;
    return {
      cost: (tokens / per) * price.unitPrice,
      basis: `${w}x${h} @${fps}fps x ${seconds}s = ${Math.round(tokens).toLocaleString('pt-BR')} tokens`,
    };
  }

  if (unit.includes('image')) {
    const images = Number(shot.images ?? 1);
    return { cost: price.unitPrice * images, basis: `${images} img x ${price.unitPrice}/img` };
  }

  if (unit.includes('megapixel')) {
    const [w, h] = dimensions(shot.res || '1080p', shot.aspect || '9x16');
    const images = Number(shot.images ?? 1);
    const mp = (w * h) / 1e6;
    return {
      cost: price.unitPrice * mp * images,
      basis: `${w}x${h} = ${mp.toFixed(2)} MP x ${images}`,
    };
  }

  return {
    error: `unidade "${price.unit}" nao é calculável automaticamente — confirme na doc (genmedia docs) antes de pedir aprovação`,
  };
}

/**
 * Estima uma lista de shots. Nunca chuta: item sem preço calculável vira
 * cost:null com nota, e o total sai marcado como parcial.
 */
export async function estimate(shots, defaultTakes = 2) {
  const rows = [];
  const warnings = [];

  for (const shot of shots) {
    const takes = Number(shot.takes ?? defaultTakes);
    const count = Number(shot.count ?? 1);
    const label = shot.id || shot.endpoint;

    let price;
    try {
      price = await priceOf(shot.endpoint);
    } catch (err) {
      warnings.push(`${label}: ${err.message}`);
      rows.push({ id: label, endpoint: shot.endpoint, calls: count * takes, cost: null, note: err.message });
      continue;
    }

    const { cost, basis, error } = costOf(shot, price);
    if (error) {
      warnings.push(`${label}: ${error}`);
      rows.push({ id: label, endpoint: shot.endpoint, calls: count * takes, cost: null, note: error });
      continue;
    }

    rows.push({
      id: label,
      endpoint: shot.endpoint,
      unit: `${price.unitPrice} ${price.currency}/${price.unit}`,
      basis,
      calls: count * takes,
      unitCost: cost,
      cost: cost * count * takes,
    });
  }

  const known = rows.filter((r) => typeof r.cost === 'number');
  const total = known.reduce((sum, r) => sum + r.cost, 0);

  return { rows, total, incomplete: rows.length !== known.length, warnings };
}
