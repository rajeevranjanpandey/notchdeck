import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 20, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const IconMusic = (p: P) => (
  <Base {...p}>
    <path d="M9 18V5l11-2v13" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="17.5" cy="16" r="2.5" />
  </Base>
);
export const IconPlay = (p: P) => (
  <Base {...p}>
    <path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />
  </Base>
);
export const IconPause = (p: P) => (
  <Base {...p}>
    <rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" />
    <rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" />
  </Base>
);
export const IconNext = (p: P) => (
  <Base {...p}>
    <path d="M3 5.5v13l8.5-6.5zM12 5.5v13l8.5-6.5z" fill="currentColor" stroke="none" />
  </Base>
);
export const IconPrev = (p: P) => (
  <Base {...p}>
    <path d="M21 5.5v13l-8.5-6.5zM12 5.5v13L3.5 12z" fill="currentColor" stroke="none" />
  </Base>
);
export const IconRepeat = (p: P) => (
  <Base {...p}>
    <path d="M17 2l4 4-4 4" />
    <path d="M3 11V9a3 3 0 0 1 3-3h15" />
    <path d="M7 22l-4-4 4-4" />
    <path d="M21 13v2a3 3 0 0 1-3 3H3" />
  </Base>
);
export const IconLyrics = (p: P) => (
  <Base {...p}>
    <path d="M4 6h16M4 12h10M4 18h7" />
  </Base>
);
export const IconWeather = (p: P) => (
  <Base {...p}>
    <circle cx="8" cy="9" r="3" />
    <path d="M8 2.5v1.2M2.5 9h1.2M4.1 5.1l.9.9M12 5.1l-.9.9" />
    <path d="M9 19h9a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.4 1.4A3 3 0 0 0 9 19z" />
  </Base>
);
export const IconVideo = (p: P) => (
  <Base {...p}>
    <rect x="2.5" y="5" width="19" height="14" rx="3.5" />
    <path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor" stroke="none" />
  </Base>
);
export const IconTimer = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 2.5M9.5 2.5h5" />
  </Base>
);
export const IconGauge = (p: P) => (
  <Base {...p}>
    <path d="M4.5 18a8.5 8.5 0 1 1 15 0" />
    <path d="M12 13l4-5" />
    <circle cx="12" cy="13.5" r="1.4" fill="currentColor" />
  </Base>
);
export const IconChevronUp = (p: P) => (
  <Base {...p}>
    <path d="M6 15l6-6 6 6" />
  </Base>
);
export const IconRefresh = (p: P) => (
  <Base {...p}>
    <path d="M20 11a8 8 0 0 0-14.6-4.5L4 8" />
    <path d="M4 3v5h5" />
    <path d="M4 13a8 8 0 0 0 14.6 4.5L20 16" />
    <path d="M20 21v-5h-5" />
  </Base>
);
export const IconExternal = (p: P) => (
  <Base {...p}>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Base>
);
export const IconPlus = (p: P) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);
export const IconMinus = (p: P) => (
  <Base {...p}>
    <path d="M5 12h14" />
  </Base>
);
export const IconReset = (p: P) => (
  <Base {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </Base>
);
export const IconSearch = (p: P) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </Base>
);
export const IconFolder = (p: P) => (
  <Base {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Base>
);
export const IconTrash = (p: P) => (
  <Base {...p}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </Base>
);
export const IconBell = (p: P) => (
  <Base {...p}>
    <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </Base>
);
export const IconLock = (p: P) => (
  <Base {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Base>
);
export const IconTerminal = (p: P) => (
  <Base {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="M7 9l3 3-3 3M12.5 15H17" />
  </Base>
);
