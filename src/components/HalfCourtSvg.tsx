/**
 * Top-down offensive end (feet as viewBox units).
 * Cropped just above the 3-point arc — baseline / rim at bottom.
 */
export default function HalfCourtSvg() {
  // Full half-court is 50×47; we show y=15.5→47 (just above the arc).
  return (
    <svg
      className="half-court__svg"
      viewBox="0 15.5 50 31.5"
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
        {/* Sidelines + baseline (no midcourt line in this crop) */}
        <path d="M 0.5 15.5 V 46.5 H 49.5 V 15.5" />

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

        {/* 3-point line */}
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

        {/* Rim */}
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
