interface Props {
  size?: number;
  /** Mute the gradient (e.g., for monochrome contexts). */
  monochrome?: boolean;
}

/**
 * The TrackPort mark: a notehead-and-arrow glyph on a gradient squircle.
 * Mirrors build/icon.svg so the in-app brand and the OS-level icon always
 * stay in sync — change one, change the other.
 */
export function BrandMark({ size = 24, monochrome = false }: Props): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="TrackPort"
    >
      <defs>
        <linearGradient id="tp-mark-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={monochrome ? "#2a2f3a" : "#6366f1"} />
          <stop offset="100%" stopColor={monochrome ? "#2a2f3a" : "#38bdf8"} />
        </linearGradient>
        <linearGradient id="tp-mark-gloss" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="224" fill="url(#tp-mark-bg)" />
      <rect width="1024" height="1024" rx="224" fill="url(#tp-mark-gloss)" />
      <g fill="#ffffff">
        <circle cx="345" cy="512" r="118" />
        <rect x="395" y="466" width="270" height="92" rx="46" />
        <path d="M620 332 L890 502 Q908 512 890 522 L620 692 Z" />
      </g>
    </svg>
  );
}
