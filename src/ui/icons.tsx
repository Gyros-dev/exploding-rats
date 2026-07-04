/**
 * Единый набор SVG-иконок (штриховые, наследуют currentColor) —
 * вместо разнокалиберных эмодзи в UI.
 */
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 20, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Геймпад — «Играть» */
export const IconPlay = (p: P) => (
  <Base {...p}>
    <path d="M6.5 7h11a4.5 4.5 0 0 1 4.4 5.5l-.9 4a2.8 2.8 0 0 1-4.9 1.2L14.6 16H9.4l-1.5 1.7A2.8 2.8 0 0 1 3 16.5l-.9-4A4.5 4.5 0 0 1 6.5 7Z" />
    <path d="M8 10.5v3M6.5 12h3" />
    <circle cx="16" cy="11" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="18.2" cy="13.2" r="0.9" fill="currentColor" stroke="none" />
  </Base>
);

/** Книга — «Правила» */
export const IconBook = (p: P) => (
  <Base {...p}>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5Z" />
    <path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" />
    <path d="M9 7.5h7M9 11h5" />
  </Base>
);

/** Кубок — лидерборд / победа */
export const IconTrophy = (p: P) => (
  <Base {...p}>
    <path d="M8 4h8v6a4 4 0 0 1-8 0V4Z" />
    <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" />
    <path d="M12 14v3m-3.5 3.5h7M10 20.5l.6-3.5m3.4 3.5-.6-3.5" />
  </Base>
);

/** Слайдеры — настройки */
export const IconGear = (p: P) => (
  <Base {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
    <circle cx="9" cy="7" r="2.2" fill="var(--bg-elevated, #fff)" />
    <circle cx="15" cy="12" r="2.2" fill="var(--bg-elevated, #fff)" />
    <circle cx="7" cy="17" r="2.2" fill="var(--bg-elevated, #fff)" />
  </Base>
);

/** Скрещённые мечи — продолжить бой */
export const IconSwords = (p: P) => (
  <Base {...p}>
    <path d="M4 4l9 9M4 4h3.5L20 16.5M20 16.5V20m0-3.5H16.5" />
    <path d="M20 4l-4.5 4.5M20 4h-3.5M20 4v3.5M8 16l-4 4m0 0v-3.5M4 20h3.5" />
  </Base>
);

/** Пауза */
export const IconPause = (p: P) => (
  <Base {...p}>
    <path d="M9 5.5v13M15 5.5v13" strokeWidth={2.4} />
  </Base>
);

/** Дискета — сохранить */
export const IconSave = (p: P) => (
  <Base {...p}>
    <path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
    <path d="M8 3v5h7V3" />
    <rect x="7.5" y="13" width="9" height="8" rx="1" />
  </Base>
);

/** Дверь — выйти */
export const IconExit = (p: P) => (
  <Base {...p}>
    <path d="M14 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8" />
    <path d="M10 12h11m0 0-3.5-3.5M21 12l-3.5 3.5" />
  </Base>
);

/** Огонь — в бой */
export const IconFlame = (p: P) => (
  <Base {...p}>
    <path d="M12 2.5c1 3-0.5 4.5-1.8 6C8.6 10.3 7 12 7 15a5 5 0 0 0 10 0c0-2-1-3.6-2-5-.4 1-.9 1.6-1.8 2.2.3-3.2-.4-7-1.2-9.7Z" />
  </Base>
);

/** Поделиться */
export const IconShare = (p: P) => (
  <Base {...p}>
    <path d="M12 3v12M12 3 8.5 6.5M12 3l3.5 3.5" />
    <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
  </Base>
);

/** Повторить — играть снова */
export const IconReplay = (p: P) => (
  <Base {...p}>
    <path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" />
  </Base>
);

/** Два игрока — мультиплеер */
export const IconUsers = (p: P) => (
  <Base {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    <path d="M15.5 5.4a3.2 3.2 0 0 1 0 5.2M17.5 14.8c1.8.7 3 2.2 3 4.7" />
  </Base>
);

/** Крыса (силуэт) — аватар бота */
export const IconRat = (p: P) => (
  <Base {...p}>
    <path d="M14.5 6.5a3 3 0 1 1 3 3" />
    <path d="M4.5 15c0-4 3.5-7 8-7 3.9 0 7 2.5 7 5.8 0 2.4-2 4.2-4.7 4.2H8.2C6 18 4.5 16.8 4.5 15Z" />
    <path d="M19.5 14c1.5.2 2.5 1.2 2.5 2.8" />
    <circle cx="16.8" cy="12.8" r="0.8" fill="currentColor" stroke="none" />
    <path d="M8 18v2m5-2v2" />
  </Base>
);

/** Череп — выбывший / поражение */
export const IconSkull = (p: P) => (
  <Base {...p}>
    <path d="M12 3a8 8 0 0 0-8 8c0 2.6 1.3 4.8 3.2 6.2V20a1.5 1.5 0 0 0 3 0v-1h3.6v1a1.5 1.5 0 0 0 3 0v-2.8A7.9 7.9 0 0 0 20 11a8 8 0 0 0-8-8Z" />
    <circle cx="9" cy="11.5" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="15" cy="11.5" r="1.6" fill="currentColor" stroke="none" />
    <path d="M12 14.5l-.9 1.8h1.8L12 14.5Z" fill="currentColor" stroke="none" />
  </Base>
);
