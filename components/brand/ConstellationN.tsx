type ConstellationNProps = {
  size?: number;
  color?: string;
  accent?: boolean;
  className?: string;
  'aria-hidden'?: boolean;
};

export function ConstellationN({
  size = 24,
  color = 'currentColor',
  accent = false,
  className,
  'aria-hidden': ariaHidden,
}: ConstellationNProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={ariaHidden ? undefined : 'img'}
      aria-label={ariaHidden ? undefined : 'spacenode'}
      aria-hidden={ariaHidden}
      shapeRendering="geometricPrecision"
    >
      <g
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <line x1="16" y1="16" x2="16" y2="48" />
        <line x1="16" y1="16" x2="48" y2="48" />
        <line x1="48" y1="16" x2="48" y2="48" />
      </g>
      <g fill={color}>
        <circle cx="16" cy="16" r="3" />
        <circle cx="16" cy="48" r="3" />
        <circle cx="48" cy="48" r="3" />
      </g>
      <circle cx="48" cy="16" r="3" fill={accent ? '#30B46C' : color} />
    </svg>
  );
}
