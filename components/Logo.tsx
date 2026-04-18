export default function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Spacenode logo"
    >
      <g stroke="currentColor" strokeWidth="0.5" opacity="0.3">
        <line x1="7.33" y1="1" x2="7.33" y2="21" />
        <line x1="14.67" y1="1" x2="14.67" y2="21" />
        <line x1="1" y1="7.33" x2="21" y2="7.33" />
        <line x1="1" y1="14.67" x2="21" y2="14.67" />
      </g>
      <g
        fontFamily="var(--font-geist), sans-serif"
        fontSize="5"
        fontWeight="400"
        fill="currentColor"
        textAnchor="middle"
        dominantBaseline="central"
      >
        <text x="3.67" y="4.17">S</text>
        <text x="11" y="4.17">P</text>
        <text x="18.33" y="4.17">A</text>
        <text x="3.67" y="11">C</text>
        <text x="11" y="11">E</text>
        <text x="18.33" y="11">N</text>
        <text x="3.67" y="17.83">O</text>
        <text x="11" y="17.83">D</text>
        <text x="18.33" y="17.83">E</text>
      </g>
    </svg>
  );
}
