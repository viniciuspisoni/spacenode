import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#1A1A1A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '22%',
        }}
      >
        <svg width="120" height="120" viewBox="0 0 64 64">
          <g stroke="#FAFAFA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <line x1="16" y1="16" x2="16" y2="48" />
            <line x1="16" y1="16" x2="48" y2="48" />
            <line x1="48" y1="16" x2="48" y2="48" />
          </g>
          <circle cx="16" cy="16" r="3" fill="#FAFAFA" />
          <circle cx="16" cy="48" r="3" fill="#FAFAFA" />
          <circle cx="48" cy="48" r="3" fill="#FAFAFA" />
          <circle cx="48" cy="16" r="3" fill="#FAFAFA" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
