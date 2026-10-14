/**
 * Top-down NBA half-court (feet as viewBox units).
 * Baseline at bottom; rim inset from baseline; half-court line at top.
 */
export default function HalfCourtSvg() {
  return (
    <svg
      className="half-court__svg"
      viewBox="0 0 50 47"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <g
        fill="none"
        stroke="var(--court-line)"
        strokeWidth="0.22"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Boundary */}
        <rect x="0.5" y="0.5" width="49" height="46" />

        {/* Center circle stub at midcourt */}
        <path d="M 19 0.5 A 6 6 0 0 0 31 0.5" />

        {/* Paint / key */}
        <rect
          x="17"
          y="28"
          width="16"
          height="18.5"
          fill="color-mix(in srgb, var(--court-line) 8%, transparent)"
        />

        {/* Block hashes */}
        <path d="M 17 32 h -0.9 M 33 32 h 0.9" />
        <path d="M 17 35 h -0.9 M 33 35 h 0.9" />
        <path d="M 17 38 h -0.9 M 33 38 h 0.9" />
        <path d="M 17 41 h -0.9 M 33 41 h 0.9" />

        {/* Free-throw circle */}
        <path d="M 19 28 A 6 6 0 0 1 31 28" />
        <path d="M 19 28 A 6 6 0 0 0 31 28" strokeDasharray="0.55 0.45" />

        {/* Restricted area */}
        <path d="M 21 41.75 A 4 4 0 0 1 29 41.75" />

        {/* 3-point: corner straights + arc from basket (25, 41.75) r≈23.75 */}
        <path d="M 3 46.5 V 32.8" />
        <path d="M 47 46.5 V 32.8" />
        <path d="M 3 32.8 A 23.75 23.75 0 0 1 47 32.8" />

        {/* Backboard */}
        <line
          x1="22.2"
          y1="45.55"
          x2="27.8"
          y2="45.55"
          stroke="color-mix(in srgb, #fff 70%, #94a3b8)"
          strokeWidth="0.32"
          strokeLinecap="butt"
        />

        {/* Rim (top-down) */}
        <circle
          cx="25"
          cy="41.75"
          r="0.85"
          stroke="var(--hoop)"
          strokeWidth="0.38"
        />
      </g>
    </svg>
  )
}
