import { ImageResponse } from 'next/og';
import { N_PRINCIPAL } from '@/components/brand/geometry';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

// Ícone de aplicativo: N estrutural principal, reverso sobre Grafite.
// Quadrado cheio — o iOS aplica a própria máscara de cantos.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#151618',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="137" height="137" viewBox="0 0 64 64">
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
