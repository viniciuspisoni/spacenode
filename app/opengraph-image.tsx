import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'spacenode — visualização que respeita seu projeto';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#1A1A1A',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          padding: '80px',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <svg width="64" height="64" viewBox="0 0 64 64">
            <g stroke="#FAFAFA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
              <line x1="16" y1="16" x2="16" y2="48" />
              <line x1="16" y1="16" x2="48" y2="48" />
              <line x1="48" y1="16" x2="48" y2="48" />
            </g>
            <circle cx="16" cy="16" r="3" fill="#FAFAFA" />
            <circle cx="16" cy="48" r="3" fill="#FAFAFA" />
            <circle cx="48" cy="48" r="3" fill="#FAFAFA" />
            <circle cx="48" cy="16" r="3" fill="#30B46C" />
          </svg>
          <span style={{ fontSize: 44, fontWeight: 500, color: '#FAFAFA', letterSpacing: '-0.025em' }}>
            spacenode
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <span style={{ fontSize: 72, fontWeight: 500, color: '#FAFAFA', letterSpacing: '-0.03em', lineHeight: 1.05 }}>
            Visualização que respeita
          </span>
          <span style={{ fontSize: 72, fontWeight: 500, color: '#FAFAFA', letterSpacing: '-0.03em', lineHeight: 1.05 }}>
            seu projeto.
          </span>
          <span style={{ fontSize: 22, color: '#6A6A6A', marginTop: 12 }}>
            spacenode.app
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
