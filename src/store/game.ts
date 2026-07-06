import { create } from 'zustand';
import { GameEngine } from '../game/engine';
import type { CardType } from '../data/cards';
import type { Card } from '../game/types';
import type { Difficulty, GameState } from '../game/types';
import {
  decideDefusePosition,
  decideFavorGive,
  decideNope,
  decidePickDiscard,
  decideTurn,
  freshMemory,
  memoryUpdates,
  type BotMemory,
} from '../ai/bot';
import { playSfx } from '../audio/sfx';
import { getUser, haptic } from '../telegram/webapp';
import { storageGet, storageRemove, storageSet } from '../telegram/storage';
import { randomSeed } from '../game/rng';
import { submitGameResult, type SubmitResult } from '../supabase/leaderboard';
import { myKey, Room } from '../multiplayer/room';
import {
  generateRoomCode,
  MP_EVENTS,
  type MpAction,
  type MpActionMsg,
  type MpSnapshotMsg,
  type MpStartMsg,
  type RoomMember,
  type SeatMap,
} from '../multiplayer/protocol';
import type { GameEvent } from '../game/types';

export type Screen =
  | 'menu'
  | 'setup'
  | 'game'
  | 'rules'
  | 'leaderboard'
  | 'result'
  | 'settings'
  | 'mp'
  | 'lobby';

export type GameMode = 'solo' | 'host' | 'guest';

export interface GameResult extends SubmitResult {
  won: boolean;
  difficulty: Difficulty;
  botCount: number;
  /** Место игрока в партии (1 = победитель) */
  place: number;
  totalPlayers: number;
  /** Мультиплеер: очки рейтинга не начисляются */
  mp?: boolean;
}

interface FxState {
  /** timestamp взрыва — триггер screen shake */
  explosionAt: number;
  explodedPlayer: number | null;
  /** timestamp перемешивания — триггер анимации колоды */
  shuffleAt: number;
  /** Вытянутый кринж — показать на весь экран */
  ratDrawn: { card: Card; player: number; at: number } | null;
}

interface GameStore {
  screen: Screen;
  /** Снимок состояния движка (клонируется после каждой мутации) */
  snapshot: GameState | null;
  difficulty: Difficulty;
  botCount: number;
  /** Окно «Неть» для человека: дедлайн (Date.now()) или null */
  nopeDeadline: number | null;
  fx: FxState;
  result: GameResult | null;
  submitting: boolean;
  /** Есть сохранённый бой (для кнопки «Продолжить» в меню) */
  hasSave: boolean;
  /** Открыт диалог выхода из боя */
  exitPrompt: boolean;

  /** Режим партии и моё место за столом */
  mode: GameMode;
  mySeat: number;
  /** Мультиплеер: код комнаты и участники лобби */
  roomCode: string | null;
  lobbyMembers: RoomMember[];
  mpBusy: boolean;
  mpError: string | null;

  navigate(screen: Screen): void;
  startGame(botCount: number, difficulty: Difficulty): void;
  quitGame(): void;
  requestExit(): void;
  cancelExit(): void;
  saveAndQuit(): Promise<void>;
  resumeGame(): Promise<boolean>;
  checkSave(): Promise<void>;

  createRoom(): Promise<void>;
  joinRoom(code: string): Promise<void>;
  leaveRoom(): Promise<void>;
  startMpGame(): void;

  humanPlayCards(cardIds: number[], opts?: { target?: number; namedType?: CardType }): string | null;
  humanDraw(): void;
  humanNope(): void;
  humanSkipNope(): void;
  humanResolveDefuse(position: number): void;
  humanGiveFavor(cardId: number): void;
  humanPickDiscard(cardId: number): void;
  humanAckFuture(): void;
}

const BOT_NAMES = [
  'Шкряб',
  'Хвостик',
  'Грызля',
  'Пискун',
  'Сырок',
  'Пасюк',
  'Чучундра',
  'Шушера',
  'Огрызок',
  'Плесень',
  'Норушка',
  'Крысюк',
];

const SAVE_KEY = 'exploding-rats:save';
const RESULT_AFTER_RAT_DELAY_MS = 1900;

interface GameSave {
  state: GameState;
  memories: BotMemory[];
  difficulty: Difficulty;
  botCount: number;
  savedAt: number;
}

// Живут вне стора: несериализуемые
let engine: GameEngine | null = null;
let memories: BotMemory[] = [];
let token = 0; // инкремент прерывает все активные async-циклы
let humanPassedNope = false;
let finishingGame = false;

// --- мультиплеер ---
let room: Room | null = null;
let seatMap: SeatMap | null = null;
/** Дедлайны хоста: окно «Пидора ответа», ввод гостя, ход гостя */
let mpNopeUntil: number | null = null;
let mpInputUntil: number | null = null;
let mpTurnUntil: number | null = null;
/** Отслеживание пропавших участников (grace до forfeit) */
const missingSince = new Map<string, number>();

const MP_NOPE_WINDOW = 3000;
const MP_INPUT_TIMEOUT = 30000;
const MP_TURN_TIMEOUT = 60000;
const MP_MISSING_GRACE = 7000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const botDelay = () => 300 + Math.random() * 600;

export const useGame = create<GameStore>((set, get) => {
  /** Снять снимок состояния для React */
  function sync(): void {
    if (engine) set({ snapshot: structuredClone(engine.state) });
  }

  /** Обработать события движка: звук, haptics, память ботов, fx */
  function processEvents(): void {
    if (!engine) return;
    for (const e of engine.drainEvents()) {
      switch (e.type) {
        case 'cards-played':
          playSfx('play');
          if (e.player === 0) haptic.light();
          break;
        case 'nope-played':
          playSfx('nope');
          haptic.warning();
          break;
        case 'card-drawn':
          playSfx('draw');
          for (const m of memories) memoryUpdates.cardDrawn(m);
          break;
        case 'deck-shuffled':
          playSfx('shuffle');
          for (const m of memories) memoryUpdates.deckShuffled(m);
          set({ fx: { ...get().fx, shuffleAt: Date.now() } });
          break;
        case 'future-seen':
          if (e.player > 0) memoryUpdates.sawFuture(memories[e.player], e.cards);
          break;
        case 'rat-returned':
          // позиция тайная: чужое знание о верхе сгорает (своё бот
          // обновил сам в момент решения)
          memories.forEach((m, i) => {
            if (i !== e.player) memoryUpdates.ratReturned(m, false);
          });
          break;
        case 'defused':
          playSfx('defuse');
          if (e.player === 0) haptic.success();
          // крыса снята с верха колоды
          for (const m of memories) memoryUpdates.cardDrawn(m);
          break;
        case 'rat-drawn':
          // кринж показывается всем на весь экран до «Крыса, живи!»/взрыва
          playSfx('nope');
          haptic.warning();
          set({ fx: { ...get().fx, ratDrawn: { card: e.card, player: e.player, at: Date.now() } } });
          break;
        case 'exploded':
          playSfx('explosion');
          haptic.error();
          for (const m of memories) memoryUpdates.cardDrawn(m);
          set({ fx: { ...get().fx, explosionAt: Date.now(), explodedPlayer: e.player } });
          // В соло-режиме после смерти человека сразу показываем проигрыш,
          // не заставляя ждать, пока боты доиграют между собой.
          if (get().mode === 'solo' && e.player === 0) {
            if (engine) {
              engine.state.phase = 'game-over';
              engine.state.winner = engine.state.players.find((p) => p.alive)?.id ?? null;
              engine.state.pending = null;
              engine.state.request = null;
            }
            void finishGame(engine?.state.winner ?? -1);
          }
          break;
        case 'card-stolen':
        case 'card-given':
        case 'discard-taken':
          playSfx('steal');
          break;
        case 'turn-changed':
          if (e.player === 0) haptic.medium();
          if (memories[e.player]) memories[e.player].playsThisTurn = 0;
          break;
        case 'game-over':
          void finishGame(e.winner);
          break;
        case 'action-resolved':
        case 'action-cancelled':
        case 'combo3-miss':
          break;
      }
    }
  }

  /** После каждой мутации движка */
  function afterMutation(): void {
    processEvents();
    sync();
  }

  async function finishGame(winner: number): Promise<void> {
    if (finishingGame) return;
    finishingGame = true;
    token++; // остановить циклы ботов
    const { difficulty, botCount } = get();
    const s = engine!.state;
    const me = s.players[0];
    const won = winner === 0;
    const totalPlayers = s.players.length;
    // eliminatedOrder: 1 = выбыл первым → место = (всего игроков) − порядок + 1
    const place = won ? 1 : totalPlayers - (me.eliminatedOrder ?? 1) + 1;
    playSfx(won ? 'win' : 'lose');
    if (won) haptic.success();

    const optimisticResult: GameResult = {
      won,
      difficulty,
      botCount,
      place,
      totalPlayers,
      points: 0,
      score: 0,
      wins: 0,
      games_played: 0,
      current_streak: 0,
      best_streak: 0,
      rank: null,
      online: false,
    };

    const showResultAndSubmit = async () => {
      // Сначала открываем итоговый экран, чтобы его анимация не ждала Supabase.
      // При поражении этот вызов откладывается, чтобы успела показаться последняя крыса.
      set({ submitting: true, hasSave: false, result: optimisticResult, screen: 'result' });
      const submitted = await submitGameResult(won, difficulty, botCount);
      set({
        submitting: false,
        result: {
          ...submitted,
          won,
          difficulty,
          botCount,
          place,
          totalPlayers,
        },
      });
    };

    // партия закончена — сохранение больше не актуально
    void storageRemove(SAVE_KEY);
    if (!won) {
      window.setTimeout(() => void showResultAndSubmit(), RESULT_AFTER_RAT_DELAY_MS);
      return;
    }
    await showResultAndSubmit();
  }

  // ==================== МУЛЬТИПЛЕЕР ====================

  /** Только звук/вибро/спецэффекты (без памяти ботов и очков) */
  function fxFor(e: GameEvent, seat: number): void {
    switch (e.type) {
      case 'cards-played': playSfx('play'); if (e.player === seat) haptic.light(); break;
      case 'nope-played': playSfx('nope'); haptic.warning(); break;
      case 'card-drawn': playSfx('draw'); break;
      case 'deck-shuffled': playSfx('shuffle'); break;
      case 'defused': playSfx('defuse'); if (e.player === seat) haptic.success(); break;
      case 'rat-drawn':
        playSfx('nope');
        haptic.warning();
        set({ fx: { ...get().fx, ratDrawn: { card: e.card, player: e.player, at: Date.now() } } });
        break;
      case 'exploded':
        playSfx('explosion');
        haptic.error();
        set({ fx: { ...get().fx, explosionAt: Date.now(), explodedPlayer: e.player } });
        break;
      case 'card-stolen':
      case 'card-given':
      case 'discard-taken':
        playSfx('steal');
        break;
      case 'turn-changed':
        if (e.player === seat) haptic.medium();
        break;
      default:
        break;
    }
  }

  function seatOfKey(key: string): number {
    return seatMap ? seatMap.seats.findIndex((s) => s.key === key) : -1;
  }

  /** Итог мультиплеер-партии (у каждого локально, очки не начисляются) */
  function finishMp(winner: number): void {
    token++;
    const { mySeat } = get();
    const s = get().snapshot ?? engine?.state;
    if (!s) return;
    const me = s.players[mySeat];
    const won = winner === mySeat;
    const result: GameResult = {
      won,
      mp: true,
      points: 0,
      score: 0,
      wins: 0,
      games_played: 0,
      current_streak: 0,
      best_streak: 0,
      rank: null,
      online: false,
      difficulty: get().difficulty,
      botCount: 0,
      place: won ? 1 : s.players.length - (me.eliminatedOrder ?? 1) + 1,
      totalPlayers: s.players.length,
    };
    playSfx(won ? 'win' : 'lose');
    if (won) haptic.success();
    const showResult = () => set({ screen: 'result', result });
    if (!won) {
      window.setTimeout(showResult, RESULT_AFTER_RAT_DELAY_MS);
      return;
    }
    showResult();
  }

  /** Хост: применить мутацию, показать эффекты, разослать снапшот */
  function mpAfterMutation(): void {
    if (!engine || !room) return;
    const events = engine.drainEvents();
    for (const e of events) {
      fxFor(e, 0);
      if (e.type === 'game-over') finishMp(e.winner);
    }
    sync();
    updateHostNopeBanner();
    room.send(MP_EVENTS.snapshot, {
      state: engine.state,
      nopeUntil: mpNopeUntil,
      events,
    });
  }

  /** Баннер «Пидора ответа» для самого хоста */
  function updateHostNopeBanner(): void {
    if (!engine) return;
    const s = engine.state;
    if (s.phase === 'nope-window' && mpNopeUntil) {
      const pending = s.pending!;
      const can =
        engine.canNope(0) &&
        (pending.player !== 0 || pending.nopeChain.length % 2 === 1) &&
        !humanPassedNope;
      set({ nopeDeadline: can ? mpNopeUntil : null });
    } else {
      set({ nopeDeadline: null });
    }
  }

  /** Хост: входящее действие гостя */
  function onGuestAction(msg: MpActionMsg): void {
    if (!engine || get().mode !== 'host') return;
    const seat = seatOfKey(msg.fromKey);
    if (seat <= 0) return; // хост шлёт действия напрямую, не через канал
    const a = msg.action;
    try {
      const s = engine.state;
      switch (a.kind) {
        case 'play':
          engine.playCards(seat, a.cardIds, { target: a.target, namedType: a.namedType });
          mpNopeUntil = Date.now() + MP_NOPE_WINDOW;
          break;
        case 'draw':
          engine.draw(seat);
          break;
        case 'nope':
          engine.playNope(seat);
          mpNopeUntil = Date.now() + MP_NOPE_WINDOW; // цепочка продлевает окно
          break;
        case 'defuse':
          if (s.request?.kind === 'defuse-position' && s.request.player === seat)
            engine.resolveDefuse(a.position);
          break;
        case 'favor':
          if (s.request?.kind === 'favor-give' && s.request.player === seat)
            engine.giveFavorCard(a.cardId);
          break;
        case 'pick':
          if (s.request?.kind === 'pick-discard' && s.request.player === seat)
            engine.pickFromDiscard(a.cardId);
          break;
        case 'ack':
          if (s.request?.kind === 'view-future' && s.request.player === seat)
            engine.ackFuture();
          break;
      }
      mpAfterMutation();
    } catch {
      // невалидное действие гостя (гонка/дабл-тап) — игнорируем
    }
  }

  /** Гость: применить снапшот хоста */
  function onGuestSnapshot(msg: MpSnapshotMsg): void {
    if (get().mode !== 'guest') return;
    const { mySeat } = get();
    for (const e of msg.events ?? []) fxFor(e, mySeat);
    set({ snapshot: msg.state });
    // окно «Пидора ответа» для гостя
    const pending = msg.state.pending;
    if (msg.state.phase === 'nope-window' && msg.nopeUntil && pending) {
      const myHand = msg.state.players[mySeat]?.hand ?? [];
      const can =
        msg.state.players[mySeat]?.alive &&
        myHand.some((c) => c.type === 'nope') &&
        (pending.player !== mySeat || pending.nopeChain.length % 2 === 1);
      set({ nopeDeadline: can ? msg.nopeUntil : null });
    } else {
      set({ nopeDeadline: null });
    }
    if (msg.state.phase === 'game-over' && msg.state.winner !== null && !get().result) {
      finishMp(msg.state.winner);
    }
  }

  /** Хост: цикл дедлайнов (окно ответа, таймауты ввода и хода гостей) */
  async function pumpMp(myToken: number): Promise<void> {
    let lastSig = '';
    while (engine && room && token === myToken) {
      const s = engine.state;
      if (s.phase === 'game-over') return;
      const sig = `${s.phase}:${s.currentPlayer}:${s.request?.kind ?? ''}:${s.pending?.nopeChain.length ?? -1}`;
      if (sig !== lastSig) {
        lastSig = sig;
        // фаза сменилась — перезаряжаем таймеры
        if (s.phase === 'nope-window') {
          if (mpNopeUntil === null) mpNopeUntil = Date.now() + MP_NOPE_WINDOW;
          humanPassedNope = false;
        } else mpNopeUntil = null;
        mpInputUntil = s.phase === 'awaiting-input' ? Date.now() + MP_INPUT_TIMEOUT : null;
        mpTurnUntil = s.phase === 'playing' ? Date.now() + MP_TURN_TIMEOUT : null;
        updateHostNopeBanner();
        if (s.phase === 'nope-window') {
          // разослать дедлайн окна
          room.send(MP_EVENTS.snapshot, { state: s, nopeUntil: mpNopeUntil, events: [] });
        }
      }
      const now = Date.now();
      try {
        if (s.phase === 'nope-window' && mpNopeUntil && now >= mpNopeUntil) {
          mpNopeUntil = null;
          engine.resolvePending();
          mpAfterMutation();
        } else if (s.phase === 'awaiting-input' && mpInputUntil && now >= mpInputUntil) {
          // гость завис — автодействие, партия не должна висеть
          const req = s.request!;
          if (req.kind === 'defuse-position') engine.resolveDefuse(0);
          else if (req.kind === 'favor-give')
            engine.giveFavorCard(s.players[req.player].hand[0].id);
          else if (req.kind === 'pick-discard')
            engine.pickFromDiscard(s.discard[s.discard.length - 1].id);
          else engine.ackFuture();
          mpAfterMutation();
        } else if (s.phase === 'playing' && mpTurnUntil && now >= mpTurnUntil) {
          engine.draw(s.currentPlayer); // авто-взятие по таймауту хода
          mpAfterMutation();
        }
        // выпавшие из комнаты игроки выбывают после grace-периода
        for (const [key, since] of missingSince) {
          if (now - since > MP_MISSING_GRACE) {
            missingSince.delete(key);
            const seat = seatOfKey(key);
            if (seat >= 0 && engine.state.players[seat]?.alive) {
              engine.forfeit(seat);
              mpAfterMutation();
            }
          }
        }
      } catch {
        /* гонка фаз — цикл продолжит */
      }
      await sleep(120);
    }
  }

  /** Общие обработчики канала комнаты */
  function roomHandlers() {
    return {
      onMembers(members: RoomMember[]) {
        set({ lobbyMembers: members });
        const st = get();
        const present = new Set(members.map((m) => m.key));
        if (st.mode === 'host' && st.screen === 'game' && seatMap) {
          for (const seat of seatMap.seats) {
            if (!present.has(seat.key)) {
              if (!missingSince.has(seat.key)) missingSince.set(seat.key, Date.now());
            } else missingSince.delete(seat.key);
          }
        }
        if (st.mode === 'guest' && st.screen === 'game' && seatMap) {
          const hostKey = seatMap.seats[0]?.key;
          if (hostKey && !present.has(hostKey)) {
            if (!missingSince.has(hostKey)) {
              missingSince.set(hostKey, Date.now());
              setTimeout(() => {
                if (missingSince.has(hostKey!) && get().screen === 'game') {
                  void get().leaveRoom();
                  set({ mpError: 'Хост покинул игру — партия завершена' });
                }
              }, MP_MISSING_GRACE);
            }
          } else if (hostKey) missingSince.delete(hostKey);
        }
      },
      onStart(msg: MpStartMsg) {
        if (get().mode !== 'guest') return;
        seatMap = msg.seatMap;
        const seat = seatMap.seats.findIndex((s) => s.key === myKey());
        if (seat < 0) return; // старт не для нас (пришли позже начала)
        set({
          mySeat: seat,
          screen: 'game',
          snapshot: msg.snapshot.state,
          result: null,
          nopeDeadline: null,
          exitPrompt: false,
          fx: { explosionAt: 0, explodedPlayer: null, shuffleAt: 0, ratDrawn: null },
        });
      },
      onAction(msg: MpActionMsg) {
        onGuestAction(msg);
      },
      onSnapshot(msg: MpSnapshotMsg) {
        onGuestSnapshot(msg);
      },
      onEnd() {
        if (get().mode === 'guest') {
          void get().leaveRoom();
          set({ mpError: 'Хост закрыл комнату' });
        }
      },
      onHello() {
        // реконнект гостя: хост повторяет start с текущим снапшотом
        if (get().mode === 'host' && engine && seatMap && room && get().screen === 'game') {
          room.send(MP_EVENTS.start, {
            seatMap,
            snapshot: { state: engine.state, nopeUntil: mpNopeUntil },
          });
        }
      },
    };
  }

  /** Гость: отправить действие хосту */
  function sendAction(action: MpAction): void {
    room?.send(MP_EVENTS.action, { fromKey: myKey(), action });
  }

  // ==================== /МУЛЬТИПЛЕЕР ====================

  /**
   * Окно «Неть»: боты решают с паузами; человек с «Нетью» получает
   * таймер-окно. Любая новая «Неть» перезапускает раунд решений.
   */
  async function handleNopeWindow(myToken: number): Promise<void> {
    if (!engine) return;
    const HUMAN_WINDOW = 2400;
    const decidedAt = new Map<number, number>(); // бот → длина цепочки, на которой он решал
    humanPassedNope = false;
    let lastLen = -1;
    let deadline = 0;

    while (engine && token === myToken && engine.state.phase === 'nope-window') {
      const s = engine.state;
      const pending = s.pending!;
      const len = pending.nopeChain.length;

      if (len !== lastLen) {
        lastLen = len;
        humanPassedNope = false;
        // человеку есть смысл вклиниваться только против чужого действия
        // или когда его собственное действие перебито чужой «Нетью»
        const humanCan =
          engine.canNope(0) && (pending.player !== 0 || len % 2 === 1);
        deadline = Date.now() + (humanCan ? HUMAN_WINDOW : 500);
        set({ nopeDeadline: humanCan ? deadline : null });
      }

      // раунд решений ботов (по одному на текущую длину цепочки)
      let botActed = false;
      for (const p of s.players) {
        if (!p.isBot || !p.alive || decidedAt.get(p.id) === len) continue;
        decidedAt.set(p.id, len);
        if (engine.canNope(p.id) && decideNope(s, p.id, pending, get().difficulty)) {
          await sleep(350 + Math.random() * 450);
          if (token !== myToken || engine.state.phase !== 'nope-window') return;
          if (engine.state.pending!.nopeChain.length !== len) break; // цепочка изменилась
          engine.playNope(p.id);
          afterMutation();
          botActed = true;
          break;
        }
      }
      if (botActed) continue;

      const humanCan = engine.canNope(0) && !humanPassedNope;
      if (humanCan && Date.now() < deadline) {
        await sleep(80);
        continue;
      }
      break;
    }

    if (engine && token === myToken && engine.state.phase === 'nope-window') {
      set({ nopeDeadline: null });
      engine.resolvePending();
      afterMutation();
      void pump(myToken);
    }
  }

  /** Главный цикл: продвигает ботов, пока не потребуется ввод человека */
  async function pump(myToken: number): Promise<void> {
    while (engine && token === myToken) {
      const s = engine.state;
      if (s.phase === 'game-over') return;

      if (s.phase === 'nope-window') {
        await handleNopeWindow(myToken);
        if (token !== myToken) return;
        continue;
      }

      if (s.phase === 'awaiting-input') {
        const req = s.request!;
        const actor = s.players[req.player];
        if (!actor.isBot) return; // ждём модалку человека
        await sleep(botDelay());
        if (token !== myToken || !engine || engine.state.request !== req) continue;
        switch (req.kind) {
          case 'defuse-position': {
            const pos = decideDefusePosition(s, get().difficulty);
            memoryUpdates.ratReturned(memories[req.player], true, pos);
            engine.resolveDefuse(pos);
            break;
          }
          case 'favor-give':
            engine.giveFavorCard(decideFavorGive(actor));
            break;
          case 'pick-discard':
            engine.pickFromDiscard(decidePickDiscard(s.discard));
            break;
          case 'view-future':
            memoryUpdates.sawFuture(memories[req.player], req.cards);
            engine.ackFuture();
            break;
        }
        afterMutation();
        continue;
      }

      // phase === 'playing'
      const current = s.players[s.currentPlayer];
      if (!current.isBot) return; // ход человека — ждём UI
      await sleep(botDelay());
      if (token !== myToken || !engine || engine.state.phase !== 'playing') continue;
      const mem = memories[current.id];
      const action = decideTurn(engine.state, current.id, mem, get().difficulty);
      try {
        if (action.type === 'draw') {
          engine.draw(current.id);
        } else {
          mem.playsThisTurn += 1;
          engine.playCards(current.id, action.cardIds, {
            target: action.target,
            namedType: action.namedType,
          });
        }
      } catch {
        // страховка: если решение бота оказалось невалидным — просто тянем
        if (engine.state.phase === 'playing') engine.draw(current.id);
      }
      afterMutation();
    }
  }

  return {
    screen: 'menu',
    snapshot: null,
    difficulty: 'medium',
    botCount: 2,
    nopeDeadline: null,
    fx: { explosionAt: 0, explodedPlayer: null, shuffleAt: 0, ratDrawn: null },
    result: null,
    submitting: false,
    hasSave: false,
    exitPrompt: false,
    mode: 'solo' as GameMode,
    mySeat: 0,
    roomCode: null,
    lobbyMembers: [],
    mpBusy: false,
    mpError: null,

    navigate: (screen) => set({ screen, mpError: null }),

    createRoom: async () => {
      finishingGame = false;
      set({ mpBusy: true, mpError: null });
      try {
        const code = generateRoomCode();
        room = await Room.join(code, roomHandlers());
        seatMap = null;
        set({ mode: 'host', roomCode: code, screen: 'lobby', mpBusy: false });
      } catch (err) {
        set({ mpBusy: false, mpError: err instanceof Error ? err.message : 'Не удалось создать комнату' });
      }
    },

    joinRoom: async (code) => {
      set({ mpBusy: true, mpError: null });
      try {
        room = await Room.join(code, roomHandlers());
        seatMap = null;
        set({ mode: 'guest', roomCode: code, screen: 'lobby', mpBusy: false });
        // вдруг партия уже идёт — попросим хоста повторить start
        room.send(MP_EVENTS.hello, { fromKey: myKey() });
      } catch (err) {
        set({ mpBusy: false, mpError: err instanceof Error ? err.message : 'Не удалось войти в комнату' });
      }
    },

    leaveRoom: async () => {
      token++;
      if (get().mode === 'host' && room && get().screen === 'game') {
        room.send(MP_EVENTS.end, { reason: 'host-left' });
      }
      const r = room;
      room = null;
      seatMap = null;
      missingSince.clear();
      engine = null;
      set({
        mode: 'solo',
        mySeat: 0,
        roomCode: null,
        lobbyMembers: [],
        screen: 'menu',
        snapshot: null,
        nopeDeadline: null,
        exitPrompt: false,
      });
      if (r) await r.leave();
    },

    startMpGame: () => {
      finishingGame = false;
      const st = get();
      if (st.mode !== 'host' || !room) return;
      const members = st.lobbyMembers;
      if (members.length < 2 || members.length > 5) return;
      token++;
      // хост всегда за местом 0
      const me = myKey();
      const ordered = [
        members.find((m) => m.key === me)!,
        ...members.filter((m) => m.key !== me),
      ];
      seatMap = {
        seats: ordered.map((m) => ({ key: m.key, name: m.name, avatarUrl: m.avatarUrl })),
      };
      engine = new GameEngine(
        ordered.map((m) => ({ name: m.name, isBot: false, avatarUrl: m.avatarUrl })),
        randomSeed(),
      );
      memories = [];
      mpNopeUntil = null;
      mpInputUntil = null;
      mpTurnUntil = null;
      missingSince.clear();
      set({
        screen: 'game',
        mySeat: 0,
        result: null,
        nopeDeadline: null,
        exitPrompt: false,
        fx: { explosionAt: 0, explodedPlayer: null, shuffleAt: 0, ratDrawn: null },
      });
      sync();
      room.send(MP_EVENTS.start, {
        seatMap,
        snapshot: { state: engine.state, nopeUntil: null },
      });
      void pumpMp(token);
    },

    startGame: (botCount, difficulty) => {
      finishingGame = false;
      token++;
      // новая партия перечёркивает старое сохранение
      void storageRemove(SAVE_KEY);
      const user = getUser();
      // случайная компания крыс-оппонентов на каждую партию
      const names = [...BOT_NAMES].sort(() => Math.random() - 0.5).slice(0, botCount);
      const specs = [
        { name: user.first_name || 'Ты', isBot: false, avatarUrl: user.photo_url },
        ...names.map((name) => ({ name, isBot: true })),
      ];
      engine = new GameEngine(specs, randomSeed());
      memories = engine.state.players.map(() => freshMemory());
      set({
        screen: 'game',
        difficulty,
        botCount,
        result: null,
        nopeDeadline: null,
        hasSave: false,
        exitPrompt: false,
        mode: 'solo',
        mySeat: 0,
        fx: { explosionAt: 0, explodedPlayer: null, shuffleAt: 0, ratDrawn: null },
      });
      afterMutation();
      void pump(token);
    },

    quitGame: () => {
      if (get().mode !== 'solo') {
        void get().leaveRoom();
        return;
      }
      token++;
      engine = null;
      set({ screen: 'menu', snapshot: null, nopeDeadline: null, exitPrompt: false });
    },

    requestExit: () => {
      const st = get();
      const phase = st.snapshot?.phase ?? engine?.state.phase;
      if (st.screen === 'game' && phase && phase !== 'game-over')
        set({ exitPrompt: true });
      else if (st.mode !== 'solo') void st.leaveRoom();
      else set({ screen: 'menu' });
    },

    cancelExit: () => set({ exitPrompt: false }),

    saveAndQuit: async () => {
      if (!engine) return;
      token++; // остановить ботов до сериализации
      const save: GameSave = {
        state: {
          ...structuredClone(engine.state),
          log: engine.state.log.slice(-30), // лог режем: CloudStorage не резиновый
        },
        memories: structuredClone(memories),
        difficulty: get().difficulty,
        botCount: get().botCount,
        savedAt: Date.now(),
      };
      const payload = JSON.stringify(save);
      engine = null;
      // экран переключаем СРАЗУ — реакция кнопки не должна ждать сеть/облако.
      // storageSet синхронно пишет localStorage, облако досохраняется в фоне.
      set({
        screen: 'menu',
        snapshot: null,
        nopeDeadline: null,
        exitPrompt: false,
        hasSave: true,
      });
      void storageSet(SAVE_KEY, payload);
    },

    resumeGame: async () => {
      finishingGame = false;
      const raw = await storageGet(SAVE_KEY);
      if (!raw) {
        set({ hasSave: false });
        return false;
      }
      let save: GameSave;
      try {
        save = JSON.parse(raw) as GameSave;
        if (!save.state?.players?.length) throw new Error('bad save');
      } catch {
        void storageRemove(SAVE_KEY);
        set({ hasSave: false });
        return false;
      }
      token++;
      engine = new GameEngine({ restore: save.state }, randomSeed());
      memories = save.memories.map((m) => ({ ...freshMemory(), ...m }));
      set({
        screen: 'game',
        difficulty: save.difficulty,
        botCount: save.botCount,
        result: null,
        nopeDeadline: null,
        exitPrompt: false,
        fx: { explosionAt: 0, explodedPlayer: null, shuffleAt: 0, ratDrawn: null },
      });
      afterMutation();
      void pump(token);
      return true;
    },

    checkSave: async () => {
      const raw = await storageGet(SAVE_KEY);
      set({ hasSave: !!raw });
    },

    humanPlayCards: (cardIds, opts = {}) => {
      const { mode, mySeat, snapshot } = get();
      if (mode === 'guest') {
        if (snapshot?.phase !== 'playing' || snapshot.currentPlayer !== mySeat) return null;
        sendAction({ kind: 'play', cardIds, target: opts.target, namedType: opts.namedType });
        return null;
      }
      // тихо игнорируем дабл-тапы: фаза уже сменилась — это не ошибка игрока
      if (!engine || engine.state.phase !== 'playing' || engine.state.currentPlayer !== 0)
        return null;
      try {
        engine.playCards(0, cardIds, opts);
      } catch (err) {
        return err instanceof Error ? err.message : 'Так нельзя';
      }
      if (mode === 'host') {
        mpNopeUntil = Date.now() + MP_NOPE_WINDOW;
        mpAfterMutation();
      } else {
        afterMutation();
        void pump(token);
      }
      return null;
    },

    humanDraw: () => {
      const { mode, mySeat, snapshot } = get();
      if (mode === 'guest') {
        if (snapshot?.phase === 'playing' && snapshot.currentPlayer === mySeat)
          sendAction({ kind: 'draw' });
        return;
      }
      if (!engine || engine.state.phase !== 'playing' || engine.state.currentPlayer !== 0) return;
      engine.draw(0);
      if (mode === 'host') mpAfterMutation();
      else {
        afterMutation();
        void pump(token);
      }
    },

    humanNope: () => {
      const { mode } = get();
      if (mode === 'guest') {
        sendAction({ kind: 'nope' });
        set({ nopeDeadline: null }); // снапшот вернёт актуальное окно
        return;
      }
      if (!engine || !engine.canNope(0)) return;
      engine.playNope(0);
      if (mode === 'host') {
        mpNopeUntil = Date.now() + MP_NOPE_WINDOW;
        mpAfterMutation();
      } else {
        afterMutation();
        // handleNopeWindow заметит изменение цепочки и продолжит
      }
    },

    humanSkipNope: () => {
      humanPassedNope = true;
      set({ nopeDeadline: null });
    },

    humanResolveDefuse: (position) => {
      const { mode } = get();
      if (mode === 'guest') {
        sendAction({ kind: 'defuse', position });
        return;
      }
      if (!engine || engine.state.request?.kind !== 'defuse-position') return;
      engine.resolveDefuse(position);
      if (mode === 'host') mpAfterMutation();
      else {
        afterMutation();
        void pump(token);
      }
    },

    humanGiveFavor: (cardId) => {
      const { mode } = get();
      if (mode === 'guest') {
        sendAction({ kind: 'favor', cardId });
        return;
      }
      if (!engine || engine.state.request?.kind !== 'favor-give') return;
      engine.giveFavorCard(cardId);
      if (mode === 'host') mpAfterMutation();
      else {
        afterMutation();
        void pump(token);
      }
    },

    humanPickDiscard: (cardId) => {
      const { mode } = get();
      if (mode === 'guest') {
        sendAction({ kind: 'pick', cardId });
        return;
      }
      if (!engine || engine.state.request?.kind !== 'pick-discard') return;
      engine.pickFromDiscard(cardId);
      if (mode === 'host') mpAfterMutation();
      else {
        afterMutation();
        void pump(token);
      }
    },

    humanAckFuture: () => {
      const { mode } = get();
      if (mode === 'guest') {
        sendAction({ kind: 'ack' });
        return;
      }
      if (!engine || engine.state.request?.kind !== 'view-future') return;
      engine.ackFuture();
      if (mode === 'host') mpAfterMutation();
      else {
        afterMutation();
        void pump(token);
      }
    },
  };
});
