/**
 * Top-down NBA half-court markings (feet → viewBox units).
 * Baseline at bottom; basket inset from baseline; half-court line at top.
 */
export default function HalfCourtSvg() {
  // viewBox: 50ft wide × 47ft deep (half of 94)
  // y=0 at half-court line, y=47 at baseline
  return (
    <svg
      className="half-court__svg"
      viewBox="0 0 50 47"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <clipPath id="court-clip">
          <rect x="0" y="0" width="50" height="47" />
        </clipPath>
      </defs>

      <g
        fill="none"
        stroke="var(--court-line)"
        strokeWidth="0.28"
        strokeLinecap="square"
        strokeLinejoin="miter"
        clipPath="url(#court-clip)"
      >
        {/* Outer boundary */}
        <rect x="0.4" y="0.4" width="49.2" height="46.2" />

        {/* Half-court center circle (top) */}
        <path d="M 19 0.4 A 6 6 0 0 0 31 0.4" />

        {/* Lane / paint: 16 wide, 19 deep from baseline */}
        <rect
          x="17"
          y="28"
          width="16"
          height="18.6"
          fill="color-mix(in srgb, #8b5a2b 12%, transparent)"
        />

        {/* Lane hash marks */}
        <path d="M 17 31.5 h -1.1 M 33 31.5 h 1.1" />
        <path d="M 17 34.5 h -1.1 M 33 34.5 h 1.1" />
        <path d="M 17 37.5 h -1.1 M 33 37.5 h 1.1" />
        <path d="M 17 40.5 h -1.1 M 33 40.5 h 1.1" />

        {/* Free-throw circle — upper half solid, lower half dashed */}
        <path d="M 19 28 A 6 6 0 0 1 31 28" />
        <path
          d="M 19 28 A 6 6 0 0 0 31 28"
          strokeDasharray="0.7 0.55"
        />

        {/* Restricted area — 4ft radius from basket */}
        <path d="M 21 41.75 A 4 4 0 0 1 29 41.75" />

        {/*
          3-point line:
          - Corner straights 3' from sideline, from baseline up to arc join
          - Arc centered on basket (25, 41.75), r=23.75
        */}
        <path d="M 3 46.6 V 33.2" />
        <path d="M 47 46.6 V 33.2" />
        {/* Arc from left corner join → top → right corner join */}
        <path d="M 3 33.2 A 23.75 23.75 0 0 1 47 33.2" />

        {/* Backboard — thin bar behind rim toward baseline */}
        <line
          x1="22"
          y1="45.65"
          x2="28"
          y2="45.65"
          stroke="color-mix(in srgb, #f8fafc 80%, #94a3b8)"
          strokeWidth="0.35"
        />

        {/* Rim — top-down circle at basket center */}
        <circle
          cx="25"
          cy="41.75"
          r="0.75"
          stroke="var(--hoop)"
          strokeWidth="0.4"
        />
        {/* Inner net suggestion */}
        <circle
          cx="25"
          cy="41.75"
          r="0.38"
          stroke="color-mix(in srgb, #fff 45%, transparent)"
          strokeWidth="0.15"
        />
      </g>
    </svg>
  )
}
