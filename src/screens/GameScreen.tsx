import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { CARD_DEFS, RAT_CARD_TYPES, type CardType } from '../data/cards';
import type { Card } from '../game/types';
import { ratsInDeck } from '../ai/bot';
import { useGame } from '../store/game';
import { useZoom } from '../store/zoom';
import { haptic } from '../telegram/webapp';
import { playSfx } from '../audio/sfx';
import { CardBack, CardFace } from '../ui/CardFace';
import { IconExit, IconPause, IconRat, IconSave, IconSkull, IconSwords } from '../ui/icons';
import { Sheet } from '../ui/Sheet';
import ui from '../ui/components.module.css';
import s from '../ui/game.module.css';

export function GameScreen() {
  const snapshot = useGame((g) => g.snapshot);
  const fx = useGame((g) => g.fx);
  if (!snapshot) return null;
  const shakeKey = fx.explosionAt;

  return (
    <motion.div
      key={shakeKey || 'table'}
      className={`${s.table} ${shakeKey && Date.now() - shakeKey < 900 ? s.shake : ''}`}
    >
      <AnimatePresence>
        {shakeKey > 0 && Date.now() - shakeKey < 900 && (
          <motion.div
            className={s.flash}
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.9 }}
          />
        )}
      </AnimatePresence>
      <ExitButton />
      <HintButton />
      <Opponents />
      <TurnBar />
      <Center />
      <Log />
      <HandArea />
      <NopeBanner />
      <RequestSheets />
      <ExitSheet />
      <RatDrawnOverlay />
    </motion.div>
  );
}

// ---------- Кринж на весь экран ----------

function RatDrawnOverlay() {
  const ratDrawn = useGame((g) => g.fx.ratDrawn);
  const mySeat = useGame((g) => g.mySeat);
  const snapshot = useGame((g) => g.snapshot)!;
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ratDrawn) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 1800);
    return () => clearTimeout(t);
  }, [ratDrawn]);
  return (
    <AnimatePresence>
      {visible && ratDrawn && (
        <motion.div
          className={s.ratOverlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ scale: 0.4, rotate: -14 }}
            animate={{ scale: 1, rotate: [6, -5, 3, 0] }}
            transition={{ type: 'spring', damping: 12, stiffness: 200 }}
          >
            <CardFace
              type="exploding-rat"
              variant={ratDrawn.card.variant}
              width={Math.min(window.innerWidth * 0.66, 280)}
            />
          </motion.div>
          <div className={s.ratOverlayTitle}>
            {ratDrawn.player === mySeat
              ? 'СМЕРТЕЛЬНЫЙ КРИНЖ!'
              : `${snapshot.players[ratDrawn.player].name} ловит кринж!`}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------- Подсказка комбинаций ----------

function HintButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={s.hintBtn} onClick={() => setOpen(true)} aria-label="Подсказка">
        ?
      </button>
      <Sheet open={open} title="Комбинации" subtitle="Играются в свой ход. Инструкции на самих картах при этом игнорируются.">
        <div className={ui.optionList} onClick={() => setOpen(false)}>
          <div className={ui.option}>
            <b>2 одинаковые</b>&nbsp;— укради случайную карту у выбранного оппонента
          </div>
          <div className={ui.option}>
            <b>3 одинаковые</b>&nbsp;— назови карту; если она есть у оппонента, он её отдаст
          </div>
          <div className={ui.option}>
            <b>5 разных</b>&nbsp;— возьми любую карту из сброса
          </div>
          <div className={ui.option}>
            «Пидора ответ» отменяет любое действие — даже не в твой ход
          </div>
          <button className="btn" onClick={() => setOpen(false)}>
            Понятно
          </button>
        </div>
      </Sheet>
    </>
  );
}

// ---------- Пауза / выход из боя ----------

function ExitButton() {
  const requestExit = useGame((g) => g.requestExit);
  return (
    <button className={s.exitBtn} onClick={requestExit} aria-label="Пауза">
      <IconPause size={18} />
    </button>
  );
}

function ExitSheet() {
  const exitPrompt = useGame((g) => g.exitPrompt);
  const mode = useGame((g) => g.mode);
  const saveAndQuit = useGame((g) => g.saveAndQuit);
  const quitGame = useGame((g) => g.quitGame);
  const cancelExit = useGame((g) => g.cancelExit);
  const mp = mode !== 'solo';
  return (
    <Sheet
      open={exitPrompt}
      title="Пауза"
      subtitle={
        mp
          ? 'Онлайн-бой нельзя сохранить: выйдешь — выбываешь из партии.'
          : 'Бой можно сохранить и продолжить позже — хоть с телефона, хоть с компьютера.'
      }
    >
      <div className={ui.optionList}>
        {!mp && (
          <button className="btn" onClick={() => void saveAndQuit()}>
            <IconSave /> Сохранить и выйти
          </button>
        )}
        <button className="btn btn--danger" onClick={quitGame}>
          <IconExit /> {mp ? 'Покинуть бой' : 'Выйти без сохранения'}
        </button>
        <button className="btn btn--ghost" onClick={cancelExit}>
          <IconSwords /> Продолжить бой
        </button>
      </div>
    </Sheet>
  );
}

// ---------- Оппоненты ----------

function Opponents() {
  const snapshot = useGame((g) => g.snapshot)!;
  const mySeat = useGame((g) => g.mySeat);
  return (
    <div className={s.opponents}>
      {snapshot.players.filter((p) => p.id !== mySeat).map((p) => {
        const active = snapshot.currentPlayer === p.id && snapshot.phase !== 'game-over';
        return (
          <div
            key={p.id}
            className={`${s.opp} ${active ? s.oppActive : ''} ${!p.alive ? s.oppDead : ''}`}
          >
            <div className={s.avatar}>
              {p.avatarUrl ? (
                <img src={p.avatarUrl} alt="" />
              ) : p.alive ? (
                <IconRat size={30} />
              ) : (
                <IconSkull size={28} />
              )}
            </div>
            {p.alive && <span className={`${s.oppCards} tnum`}>{p.hand.length}</span>}
            {active && snapshot.underAttack && (
              <span className={s.oppAttack}>⚔️{snapshot.turnsRemaining}</span>
            )}
            <span className={s.oppName}>{p.name}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Статус хода ----------

function TurnBar() {
  const snapshot = useGame((g) => g.snapshot)!;
  const mySeat = useGame((g) => g.mySeat);
  const current = snapshot.players[snapshot.currentPlayer];
  const mine = snapshot.currentPlayer === mySeat;
  return (
    <div className={s.turnBar}>
      <motion.span
        key={snapshot.currentPlayer + ':' + snapshot.turnsRemaining}
        className={`${s.turnChip} ${mine ? s.turnChipMine : ''}`}
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 18, stiffness: 400 }}
      >
        {mine ? 'Твой ход' : `Ходит ${current.name}`}
        {snapshot.turnsRemaining > 1 && (
          <b className="tnum">×{snapshot.turnsRemaining}</b>
        )}
        {snapshot.underAttack && '⚔️'}
      </motion.span>
    </div>
  );
}

// ---------- Центр стола ----------

function Center() {
  const snapshot = useGame((g) => g.snapshot)!;
  const mySeat = useGame((g) => g.mySeat);
  const humanDraw = useGame((g) => g.humanDraw);
  const myTurn = snapshot.currentPlayer === mySeat && snapshot.phase === 'playing';
  const deckSize = snapshot.deck.length;
  const risk = deckSize > 0 ? ratsInDeck(snapshot) / deckSize : 0;
  const topDiscard = snapshot.discard[snapshot.discard.length - 1];

  return (
    // крупные карты по центру: --card-w каскадом уходит в CardBack/CardFace
    <div className={s.center} style={{ '--card-w': '140px' } as React.CSSProperties}>
      <div className={s.deckWrap}>
        <motion.div
          className={s.deckStack}
          whileTap={myTurn ? { scale: 0.94 } : undefined}
          onClick={() => {
            if (myTurn) {
              haptic.light();
              humanDraw();
            }
          }}
        >
          {deckSize > 2 && <CardBack />}
          {deckSize > 1 && <CardBack />}
          <div className={risk > 0.25 ? s.deckPulse : undefined} style={{ borderRadius: 12 }}>
            {deckSize > 0 ? (
              <CardBack />
            ) : (
              <div className={s.discardEmpty}>Колода пуста</div>
            )}
          </div>
        </motion.div>
        <span className={`${s.deckCount} tnum`}>{deckSize}</span>
      </div>

      <div className={s.deckWrap}>
        <AnimatePresence mode="popLayout">
          {topDiscard ? (
            <motion.div
              key={topDiscard.id}
              initial={{ y: 60, rotate: -12, scale: 1.15, opacity: 0 }}
              animate={{ y: 0, rotate: 0, scale: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            >
              <CardFace
                type={topDiscard.type}
                variant={topDiscard.variant}
                onClick={() =>
                  useZoom.getState().open({ type: topDiscard.type, variant: topDiscard.variant })
                }
              />
            </motion.div>
          ) : (
            <div className={s.discardEmpty}>Сброс</div>
          )}
        </AnimatePresence>
        <span className={s.deckCount}>сброс</span>
      </div>
    </div>
  );
}

// ---------- Лог ----------

function Log() {
  const log = useGame((g) => g.snapshot!.log);
  const [open, setOpen] = useState(false);
  const recent = log.slice(-3);
  return (
    <>
      <div className={s.logCollapsed} onClick={() => setOpen((v) => !v)}>
        {recent.length === 0 && <div className={s.logLine}>…</div>}
        {recent.map((e) => (
          <div key={e.id} className={s.logLine}>
            {e.text}
          </div>
        ))}
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            className={`${s.logExpanded} glass`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            onClick={() => setOpen(false)}
          >
            {[...log].slice(-40).reverse().map((e) => (
              <p key={e.id}>{e.text}</p>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ---------- Рука и действия ----------

function HandArea() {
  const snapshot = useGame((g) => g.snapshot)!;
  const humanPlayCards = useGame((g) => g.humanPlayCards);
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<null | 'target' | 'named'>(null);
  const [pendingTarget, setPendingTarget] = useState<number | null>(null);
  const [preview, setPreview] = useState<Card | null>(null);

  const mySeat = useGame((g) => g.mySeat);
  const me = snapshot.players[mySeat];
  const myTurn = snapshot.currentPlayer === mySeat && snapshot.phase === 'playing';
  const hand = me.hand;

  // сбрасываем выбор, когда карты уходят из руки
  useEffect(() => {
    setSelected((sel) => sel.filter((id) => hand.some((c) => c.id === id)));
  }, [hand]);

  const selectedCards = useMemo(
    () => selected.map((id) => hand.find((c) => c.id === id)!).filter(Boolean),
    [selected, hand],
  );

  const playKind = useMemo(() => {
    if (selectedCards.length === 0) return null;
    const types = new Set(selectedCards.map((c) => c.type));
    if (selectedCards.length === 1) {
      const t = selectedCards[0].type;
      if (['attack', 'skip', 'favor', 'shuffle', 'see-the-future'].includes(t)) return t;
      return null;
    }
    if ((selectedCards.length === 2 || selectedCards.length === 3) && types.size === 1)
      return selectedCards.length === 2 ? 'combo2' : 'combo3';
    if (selectedCards.length === 5 && types.size === 5) return 'combo5';
    return null;
  }, [selectedCards]);

  const needsTarget = playKind === 'favor' || playKind === 'combo2' || playKind === 'combo3';

  const doPlay = (target?: number, namedType?: CardType) => {
    const err = humanPlayCards(selected, { target, namedType });
    setError(err);
    if (!err) {
      setSelected([]);
      setPicking(null);
      setPendingTarget(null);
    }
  };

  const onPlayClick = () => {
    haptic.light();
    playSfx('tap');
    if (needsTarget) setPicking('target');
    else doPlay();
  };

  const toggle = (id: number) => {
    haptic.selection();
    playSfx('tap');
    setError(null);
    const card = hand.find((c) => c.id === id);
    if (selected.includes(id)) {
      // повторный тап по выделенной — снять выделение
      setSelected((sel) => sel.filter((x) => x !== id));
    } else {
      setSelected((sel) => [...sel, id]);
      if (card) setPreview(card); // полноэкранное превью выбранной карты
    }
  };

  const opponents = snapshot.players.filter((p) => p.id !== mySeat && p.alive);
  // веер должен помещаться в узкий вьюпорт: чем больше карт, тем уже каждая
  const cardW = hand.length > 5 ? Math.max(56, 88 - (hand.length - 5) * 7) : 88;

  return (
    <div className={s.handArea}>
      <div className={s.hand}>
        {hand.length === 0 && <div className={s.handEmpty}>Рука пуста — тяни карту</div>}
        <AnimatePresence>
          {hand.map((card, i) => {
            const n = hand.length;
            const angle = (i - (n - 1) / 2) * Math.min(6, 44 / n);
            return (
              <motion.div
                key={card.id}
                className={s.handCard}
                layout
                initial={{ y: 120, opacity: 0, rotate: 0 }}
                animate={{ y: 0, opacity: 1, rotate: angle }}
                exit={{ y: -80, opacity: 0, scale: 0.7 }}
                transition={{ type: 'spring', damping: 22, stiffness: 260, delay: i * 0.015 }}
              >
                <CardFace
                  type={card.type}
                  variant={card.variant}
                  width={cardW}
                  selected={selected.includes(card.id)}
                  onClick={() => toggle(card.id)}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <div className={s.actions}>
        <button className="btn btn--ghost" disabled={!myTurn} onClick={() => useGame.getState().humanDraw()}>
          Взять карту
        </button>
        <button className="btn" disabled={!myTurn || !playKind} onClick={onPlayClick}>
          Сыграть{selected.length > 1 ? ` (${selected.length})` : ''}
        </button>
      </div>
      {error && <div className={s.playError}>{error}</div>}

      {/* Полноэкранное превью выбранной карты */}
      <AnimatePresence>
        {preview && (
          <motion.div
            className={s.previewOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreview(null)}
          >
            <motion.div
              className={s.previewCard}
              initial={{ scale: 0.5, y: 120 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.6, y: 80, opacity: 0 }}
              transition={{ type: 'spring', damping: 22, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
            >
              <CardFace
                type={preview.type}
                variant={preview.variant}
                width={Math.min(window.innerWidth * 0.72, 300)}
              />
            </motion.div>
            <div className={s.previewActions} onClick={(e) => e.stopPropagation()}>
              {playKind && myTurn && (
                <button
                  className="btn"
                  onClick={() => {
                    setPreview(null);
                    onPlayClick();
                  }}
                >
                  Сыграть{selected.length > 1 ? ` (${selected.length})` : ''}
                </button>
              )}
              <button
                className="btn btn--ghost"
                onClick={() => {
                  setSelected((sel) => sel.filter((x) => x !== preview.id));
                  setPreview(null);
                }}
              >
                Убрать из выбора
              </button>
              <button className="btn btn--ghost" onClick={() => setPreview(null)}>
                Закрыть
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Выбор оппонента */}
      <Sheet
        open={picking === 'target'}
        title="Выбери оппонента"
        subtitle={playKind === 'favor' ? 'Он сам решит, что отдать' : playKind === 'combo3' ? 'Дальше назовёшь карту' : 'Украдёшь случайную карту'}
      >
        <div className={ui.optionList}>
          {opponents.map((p) => (
            <button
              key={p.id}
              className={ui.option}
              onClick={() => {
                if (playKind === 'combo3') {
                  setPendingTarget(p.id);
                  setPicking('named');
                } else {
                  doPlay(p.id);
                }
              }}
            >
              🐀 {p.name}
              <span style={{ marginLeft: 'auto', color: 'var(--text-dim)' }} className="tnum">
                {p.hand.length} карт
              </span>
            </button>
          ))}
          <button className={ui.option} onClick={() => setPicking(null)}>
            ✕ Отмена
          </button>
        </div>
      </Sheet>

      {/* Названная карта для комбо из 3 */}
      <Sheet open={picking === 'named'} title="Назови карту" subtitle="Если она есть у оппонента — он отдаст её">
        <div className={ui.optionList}>
          {(['defuse', 'nope', 'attack', 'skip', 'see-the-future', 'shuffle', 'favor', ...RAT_CARD_TYPES] as CardType[]).map(
            (t) => (
              <button key={t} className={ui.option} onClick={() => doPlay(pendingTarget!, t)}>
                {CARD_DEFS[t].icon} {CARD_DEFS[t].name}
              </button>
            ),
          )}
          <button className={ui.option} onClick={() => setPicking(null)}>
            ✕ Отмена
          </button>
        </div>
      </Sheet>
    </div>
  );
}

// ---------- Окно «Неть» ----------

function NopeBanner() {
  const nopeDeadline = useGame((g) => g.nopeDeadline);
  const snapshot = useGame((g) => g.snapshot)!;
  const humanNope = useGame((g) => g.humanNope);
  const humanSkipNope = useGame((g) => g.humanSkipNope);
  const [, force] = useState(0);

  useEffect(() => {
    if (!nopeDeadline) return;
    const t = setInterval(() => force((v) => v + 1), 100);
    return () => clearInterval(t);
  }, [nopeDeadline]);

  if (!nopeDeadline || !snapshot.pending) return null;
  const pending = snapshot.pending;
  const remaining = Math.max(0, nopeDeadline - Date.now());
  const pct = Math.min(100, (remaining / 2400) * 100);
  const actor = snapshot.players[pending.player];
  const cancelled = pending.nopeChain.length % 2 === 1;

  return (
    <motion.div
      className={`${s.nopeBanner} glass`}
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
    >
      <div style={{ flex: 1, fontSize: 'var(--fs-small)' }}>
        {cancelled
          ? 'Действие отменено. Перебить своим ответом?'
          : `${actor.name}: ${describeKind(pending)} — отвечаешь?`}
      </div>
      <button className={s.nopeBtn} onClick={humanNope}>
        ПИДОРА ОТВЕТ!
      </button>
      <button className="btn btn--ghost" style={{ width: 'auto', padding: '10px 14px' }} onClick={humanSkipNope}>
        Пропустить
      </button>
      <div className={s.nopeProgress} style={{ width: `${pct}%` }} />
    </motion.div>
  );
}

function describeKind(p: { kind: string; cards: Card[] }): string {
  switch (p.kind) {
    case 'attack':
    case 'skip':
    case 'favor':
    case 'shuffle':
    case 'see-the-future':
      return `«${CARD_DEFS[p.kind].name}»`;
    case 'combo2': return 'кража (пара)';
    case 'combo3': return 'требование карты (тройка)';
    case 'combo5': return '5 разных карт';
    default: return 'действие';
  }
}

// ---------- Запросы ввода (модалки человека) ----------

function RequestSheets() {
  const snapshot = useGame((g) => g.snapshot)!;
  const mySeat = useGame((g) => g.mySeat);
  const humanResolveDefuse = useGame((g) => g.humanResolveDefuse);
  const humanGiveFavor = useGame((g) => g.humanGiveFavor);
  const humanPickDiscard = useGame((g) => g.humanPickDiscard);
  const humanAckFuture = useGame((g) => g.humanAckFuture);
  const req = snapshot.request;
  const forHuman = req && 'player' in req && req.player === mySeat;

  const deckSize = snapshot.deck.length;
  const middle = Math.floor(deckSize / 2);

  return (
    <>
      {/* Обезвредь: позиция крысы */}
      <Sheet
        open={!!forHuman && req!.kind === 'defuse-position'}
        title="🌿 Крыса, живи!"
        subtitle="Кринж обезврежен. Втайне верни его в колоду — никто не увидит, куда ты его положил."
      >
        <div className={s.posGrid}>
          <button className={ui.option} onClick={() => humanResolveDefuse(0)}>
            🔝 Наверх
          </button>
          <button className={ui.option} onClick={() => humanResolveDefuse(1)}>
            2-й сверху
          </button>
          <button className={ui.option} onClick={() => humanResolveDefuse(middle)}>
            🎲 В середину
          </button>
          <button className={ui.option} onClick={() => humanResolveDefuse(deckSize)}>
            ⬇️ В самый низ
          </button>
          <button
            className={ui.option}
            style={{ gridColumn: '1 / -1' }}
            onClick={() => humanResolveDefuse(Math.floor(Math.random() * (deckSize + 1)))}
          >
            🌀 Случайно
          </button>
        </div>
      </Sheet>

      {/* Подлижись: человек отдаёт карту */}
      <Sheet
        open={!!forHuman && req!.kind === 'favor-give'}
        title="🤲 Придётся поделиться"
        subtitle={
          req?.kind === 'favor-give'
            ? `${snapshot.players[req.to].name} разрешил себе доебаца. Гони одну (1) карту — выбери, какую отдашь.`
            : ''
        }
      >
        <div className={ui.cardRow}>
          {snapshot.players[mySeat].hand.map((c) => (
            <CardFace
              key={c.id}
              type={c.type}
              variant={c.variant}
              width={72}
              onClick={() =>
                useZoom.getState().open(
                  { type: c.type, variant: c.variant },
                  { label: 'Отдать эту карту', run: () => humanGiveFavor(c.id) },
                )
              }
            />
          ))}
        </div>
      </Sheet>

      {/* Подсмотри грядущее */}
      <Sheet
        open={!!forHuman && req!.kind === 'view-future'}
        title="🧮 Бухгалтерия интересуется"
        subtitle="Три верхние карты колоды (первая — верхняя). Вернутся в том же порядке."
      >
        {req?.kind === 'view-future' && (
          <>
            <div className={ui.cardRow}>
              {req.cards.length === 0 && <p>Колода пуста.</p>}
              {req.cards.map((c, i) => (
                <div key={c.id} style={{ textAlign: 'center' }}>
                  <CardFace
                    type={c.type}
                    variant={c.variant}
                    width={84}
                    onClick={() => useZoom.getState().open({ type: c.type, variant: c.variant })}
                  />
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                    {i === 0 ? 'верхняя' : `${i + 1}-я`}
                  </div>
                </div>
              ))}
            </div>
            <button className="btn" onClick={humanAckFuture}>
              Понятно
            </button>
          </>
        )}
      </Sheet>

      {/* Комбо из 5: карта из сброса */}
      <Sheet
        open={!!forHuman && req!.kind === 'pick-discard'}
        title="🗑 Выбери карту из сброса"
        subtitle="Комбо из 5 разных: любая карта из стопки сброса — твоя."
      >
        <div className={ui.cardRow}>
          {[...snapshot.discard].reverse().map((c) => (
            <CardFace
              key={c.id}
              type={c.type}
              variant={c.variant}
              width={72}
              onClick={() =>
                useZoom.getState().open(
                  { type: c.type, variant: c.variant },
                  { label: 'Взять эту карту', run: () => humanPickDiscard(c.id) },
                )
              }
            />
          ))}
        </div>
      </Sheet>
    </>
  );
}
