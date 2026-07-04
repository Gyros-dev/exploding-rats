import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { ALL_CARD_TYPES, CARD_DEFS } from '../data/cards';
import { useGame } from '../store/game';
import { useSettings } from '../store/settings';
import { shareResult } from '../telegram/webapp';
import { IconReplay, IconShare, IconSkull, IconTrophy } from '../ui/icons';
import s from '../ui/screens.module.css';

const base = import.meta.env.BASE_URL;

/**
 * Победа: карты скачут по экрану, как в финале «Косынки» —
 * простая физика на rAF (гравитация + отскок от низа).
 */
function WinCardsRain() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current!;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const CW = 76;
    const CH = Math.round(CW * (1039 / 744));
    interface Sprite {
      el: HTMLImageElement;
      x: number; y: number; vx: number; vy: number; rot: number; vr: number;
      bounces: number; born: number;
    }
    const sprites: Sprite[] = [];
    const types = ALL_CARD_TYPES;
    for (let i = 0; i < 14; i++) {
      const t = types[Math.floor(Math.random() * types.length)];
      const v = 1 + Math.floor(Math.random() * CARD_DEFS[t].count);
      const el = document.createElement('img');
      el.src = `${base}assets/cards/${CARD_DEFS[t].imageStem}-${v}.webp`;
      el.style.cssText = `position:absolute;width:${CW}px;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.4);will-change:transform;`;
      host.appendChild(el);
      sprites.push({
        el,
        x: Math.random() * (W - CW),
        y: -CH - Math.random() * 400,
        vx: (Math.random() - 0.5) * 7,
        vy: Math.random() * 2,
        rot: (Math.random() - 0.5) * 30,
        vr: (Math.random() - 0.5) * 6,
        bounces: 0,
        born: i * 260, // выпадают по очереди
      });
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      let alive = 0;
      for (const sp of sprites) {
        if (now - t0 < sp.born) { alive++; continue; }
        sp.vy += 0.45;
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.rot += sp.vr;
        if (sp.y > H - CH && sp.vy > 0 && sp.bounces < 6) {
          sp.y = H - CH;
          sp.vy = -sp.vy * 0.72;
          sp.bounces++;
        }
        if (sp.x > -CW - 20 && sp.x < W + 20 && sp.y < H + CH) alive++;
        sp.el.style.transform = `translate(${sp.x}px, ${sp.y}px) rotate(${sp.rot}deg)`;
      }
      if (alive > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      host.innerHTML = '';
    };
  }, []);
  return (
    <div
      ref={ref}
      style={{ position: 'fixed', inset: 0, zIndex: 40, pointerEvents: 'none', overflow: 'hidden' }}
    />
  );
}

/** Поражение: взрыв — вспышка и разлетающиеся искры */
function LoseExplosion() {
  const parts = Array.from({ length: 26 }, (_, i) => i);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40, pointerEvents: 'none', overflow: 'hidden' }}>
      <motion.div
        style={{
          position: 'absolute', inset: 0,
          background:
            'radial-gradient(circle at 50% 40%, rgba(255,170,60,.95), rgba(230,51,41,.6) 40%, transparent 70%)',
        }}
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 1.1 }}
      />
      {parts.map((i) => {
        const angle = (i / parts.length) * Math.PI * 2 + Math.random() * 0.4;
        const dist = 130 + Math.random() * 260;
        const size = 6 + Math.random() * 14;
        return (
          <motion.div
            key={i}
            style={{
              position: 'absolute', left: '50%', top: '40%',
              width: size, height: size, borderRadius: '50%',
              background: i % 3 ? 'var(--fire)' : 'var(--warning)',
            }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{
              x: Math.cos(angle) * dist,
              y: Math.sin(angle) * dist + 90,
              opacity: 0,
              scale: 0.3,
            }}
            transition={{ duration: 0.9 + Math.random() * 0.5, ease: 'easeOut' }}
          />
        );
      })}
    </div>
  );
}

export function ResultScreen() {
  const result = useGame((g) => g.result);
  const submitting = useGame((g) => g.submitting);
  const startGame = useGame((g) => g.startGame);
  const navigate = useGame((g) => g.navigate);
  const settings = useSettings();

  if (!result && !submitting) {
    return (
      <div className={s.screen}>
        <p>Результат не найден.</p>
        <button className="btn" onClick={() => navigate('menu')}>В меню</button>
      </div>
    );
  }

  if (!result) {
    return (
      <div className={s.screen}>
        <p style={{ textAlign: 'center', color: 'var(--text-dim)' }}>Подсчитываю очки…</p>
      </div>
    );
  }

  return (
    <div className={s.screen}>
      {result.won ? <WinCardsRain /> : <LoseExplosion />}
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 14, stiffness: 220 }}
        className={s.resultEmoji}
        style={{ color: result.won ? 'var(--warning)' : 'var(--danger)' }}
      >
        {result.won ? <IconTrophy size={88} /> : <IconSkull size={88} />}
      </motion.div>

      <h1 className={s.title} style={{ textAlign: 'center' }}>
        {result.won ? 'Победа!' : 'Кринж…'}
      </h1>
      <p className={s.subtitle} style={{ textAlign: 'center' }}>
        {result.mp
          ? result.won
            ? `Ты пережил ${result.totalPlayers - 1} живых соперников!`
            : `Место ${result.place} из ${result.totalPlayers}. Кринж оказался смертельным.`
          : result.won
            ? `Ты пережил ${result.botCount} ботов на сложности «${
                { easy: 'лёгкий', medium: 'средний', hard: 'сложный' }[result.difficulty]
              }»`
            : `Место ${result.place} из ${result.totalPlayers}. Кринж оказался смертельным.`}
      </p>

      {result.won && !result.mp && !submitting && (
        <motion.div
          className={`${s.pointsBig} tnum`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          +{result.points}
        </motion.div>
      )}

      {submitting && !result.mp && (
        <div className={s.offlineBadge}>
          Подсчитываю очки и обновляю таблицу лидеров…
        </div>
      )}

      {result.mp && (
        <div className={s.offlineBadge}>
          Мультиплеер — очки рейтинга пока не начисляются
        </div>
      )}

      <div className={s.statGrid} style={result.mp || submitting ? { display: 'none' } : undefined}>
        <div className={`glass ${s.stat}`}>
          <b className="tnum">{result.score.toLocaleString('ru-RU')}</b>
          <span>всего очков</span>
        </div>
        <div className={`glass ${s.stat}`}>
          <b className="tnum">{result.rank ? `#${result.rank}` : '—'}</b>
          <span>{result.online ? 'место в топе' : 'офлайн-режим'}</span>
        </div>
        <div className={`glass ${s.stat}`}>
          <b className="tnum">{result.wins}</b>
          <span>побед</span>
        </div>
        <div className={`glass ${s.stat}`}>
          <b className="tnum">{result.current_streak}</b>
          <span>серия (лучшая {result.best_streak})</span>
        </div>
      </div>

      {result.won && !result.mp && !submitting && (
        <button className="btn btn--ghost" onClick={() => shareResult(result.points, result.rank)}>
          <IconShare /> Поделиться
        </button>
      )}
      {result.mp ? (
        <>
          <button className="btn" onClick={() => navigate('lobby')}>
            <IconReplay /> В комнату — реванш!
          </button>
          <button className="btn btn--ghost" onClick={() => void useGame.getState().leaveRoom()}>
            Покинуть комнату
          </button>
        </>
      ) : (
        <>
          <button className="btn" onClick={() => startGame(settings.botCount, settings.difficulty)}>
            <IconReplay /> Играть снова
          </button>
          <button className="btn btn--ghost" onClick={() => navigate('menu')}>
            В меню
          </button>
        </>
      )}
    </div>
  );
}
