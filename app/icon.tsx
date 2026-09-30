import { ImageResponse } from 'next/og';
import { N_MICRO } from '@/components/brand/geometry';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

// Favicon: símbolo isolado na versão micro (16–31 px), reverso sobre Grafite,
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
          <path d={N_MICRO} fill="#FFFFFF" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
