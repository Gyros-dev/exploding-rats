import { memo, useEffect, useState } from 'react';
import { CARD_BACK_STEM, CARD_DEFS, type CardType } from '../data/cards';
import styles from './components.module.css';

const base = import.meta.env.BASE_URL;

/**
 * Лицо карты. У каждого экземпляра свой арт: <imageStem>-<variant>.webp
 * из public/assets/cards/. Порядок попыток: .webp → .png → CSS-плейсхолдер,
 * так что достаточно положить файл с оговорённым именем — код не меняется.
 */
export const CardFace = memo(function CardFace({
  type,
  variant = 1,
  width,
  selected = false,
  onClick,
}: {
  type: CardType;
  variant?: number;
  width?: number;
  selected?: boolean;
  onClick?: () => void;
}) {
  const def = CARD_DEFS[type];
  const stem = `${base}assets/cards/${def.imageStem}-${variant}`;
  const [src, setSrc] = useState(`${stem}.webp`);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setSrc(`${stem}.webp`);
    setBroken(false);
  }, [stem]);
  const style = width ? ({ '--card-w': `${width}px` } as React.CSSProperties) : undefined;

  return (
    <div
      className={`${styles.card} ${selected ? styles.cardSelected : ''}`}
      style={style}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      {!broken ? (
        <img
          className={styles.cardImg}
          src={src}
          alt={def.name}
          draggable={false}
          onError={() =>
            src.endsWith('.webp') ? setSrc(`${stem}.png`) : setBroken(true)
          }
        />
      ) : (
        <div
          className={styles.cardPlaceholder}
          style={{
            background: `linear-gradient(160deg, ${def.gradient[0]} 0%, ${def.gradient[1]} 100%)`,
          }}
        >
          <span className={styles.cardIcon}>{def.icon}</span>
          <span className={styles.cardName}>{def.name}</span>
        </div>
      )}
    </div>
  );
});

/** Рубашка карты (тоже с fallback-плейсхолдером) */
export const CardBack = memo(function CardBack({ width }: { width?: number }) {
  const stem = `${base}assets/cards/${CARD_BACK_STEM}`;
  const [src, setSrc] = useState(`${stem}.webp`);
  const [broken, setBroken] = useState(false);
  const style = width ? ({ '--card-w': `${width}px` } as React.CSSProperties) : undefined;
  return (
    <div className={styles.card} style={style}>
      {!broken ? (
        <img
          className={styles.cardImg}
          src={src}
          alt=""
          draggable={false}
          onError={() =>
            src.endsWith('.webp') ? setSrc(`${stem}.png`) : setBroken(true)
          }
        />
      ) : (
        <div className={`${styles.cardPlaceholder} ${styles.cardBack}`}>
          <span className={styles.cardIcon}>🐀</span>
        </div>
      )}
    </div>
  );
});
