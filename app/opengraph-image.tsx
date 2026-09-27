import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { N_PRINCIPAL, WORDMARK_PATH } from '@/components/brand/geometry';
import { OG_HEADLINE_PATH, OG_LABEL_PATH } from '@/components/brand/og-type';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'SpaceNode — Visualize seus projetos.';

// Mesma leitura da landing: texto claro no topo, arquitetura logo abaixo.
// A residência ocupa a largura toda sem cortes no edifício.
const PHOTO = { width: 1632, height: 656 };
const PHOTO_TOP = 240;
const PHOTO_SCALED_HEIGHT = Math.round((size.width * PHOTO.height) / PHOTO.width);
const PHOTO_OFFSET = -36;

export default async function OgImage() {
  const photo = await readFile(join(process.cwd(), 'public/demo-render.jpg'));
  const src = `data:image/jpeg;base64,${photo.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: '#151618',
        }}
      >
        <svg
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          {/* Assinatura horizontal, reversa, 48 px de altura */}
          <g transform="translate(64 48) scale(0.75)" fill="#FFFFFF">
            <path d={N_PRINCIPAL.apoioEsquerdo} />
            <path d={N_PRINCIPAL.ligacao} />
            <path d={N_PRINCIPAL.apoioDireito} />
            <path d={WORDMARK_PATH} />
          </g>
          <path d={OG_LABEL_PATH} fill="#BDC2C8" />
          <path d={OG_HEADLINE_PATH} fill="#FFFFFF" />
        </svg>

        <div
          style={{
            position: 'absolute',
            left: 0,
            top: PHOTO_TOP,
            width: size.width,
            height: size.height - PHOTO_TOP,
            display: 'flex',
            overflow: 'hidden',
          }}
        >
          <img
            src={src}
            alt=""
            width={size.width}
            height={PHOTO_SCALED_HEIGHT}
            style={{ position: 'absolute', left: 0, top: PHOTO_OFFSET }}
          />
        </div>
      </div>
    ),
    { ...size }
  );
}
