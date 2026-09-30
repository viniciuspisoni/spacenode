import { ImageResponse } from 'next/og';
import { N_PRINCIPAL } from '@/components/brand/geometry';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

// Favicon: o mesmo contorno do N oficial, reverso sobre Grafite,
// com a proteção mínima do manual (14 unidades em torno da forma de 56).
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#151618',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="24" height="24" viewBox="0 0 64 64">
          <g fill="#FFFFFF">
            <path d={N_PRINCIPAL.apoioEsquerdo} />
            <path d={N_PRINCIPAL.ligacao} />
            <path d={N_PRINCIPAL.apoioDireito} />
          </g>
        </svg>
      </div>
    ),
    { ...size }
  );
}
