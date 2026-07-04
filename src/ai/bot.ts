import { CARD_DEFS, RAT_CARD_TYPES, type CardType } from '../data/cards';
import type { Card, GameState, PendingAction, PlayerState } from '../game/types';
import type { Difficulty } from '../game/types';

/**
 * ИИ ботов. Все решения — чистые функции от (публичное состояние, память бота).
 * Бот НЕ подглядывает в чужие руки и в колоду: он знает только то, что знал бы
 * живой игрок (свою руку, сброс, количества карт, результаты «Подсмотри»).
 */

export interface BotMemory {
  /**
   * Знание о верхних картах колоды (после «Подсмотри грядущее»).
   * [0] — верхняя. null = неизвестно.
   */
  knownTop: (CardType | null)[];
  /** Сколько карт бот уже сыграл в этот свой ход (ограничитель) */
  playsThisTurn: number;
}

export function freshMemory(): BotMemory {
  return { knownTop: [], playsThisTurn: 0 };
}

/** Обновление памяти по публичным событиям — вызывает оркестратор */
export const memoryUpdates = {
  sawFuture(mem: BotMemory, cards: Card[]): void {
    mem.knownTop = cards.map((c) => c.type);
  },
  cardDrawn(mem: BotMemory): void {
    mem.knownTop.shift();
  },
  deckShuffled(mem: BotMemory): void {
    mem.knownTop = [];
  },
  /** Кто-то вернул крысу «Обезвредью»: позиция тайная — знание сгорает */
  ratReturned(mem: BotMemory, byMe: boolean, knownPos?: number): void {
    if (byMe && knownPos !== undefined) {
      // бот сам знает, куда положил
      const top = mem.knownTop.slice();
      top.splice(knownPos, 0, 'exploding-rat');
      mem.knownTop = top;
    } else {
      mem.knownTop = [];
    }
  },
};

export type BotTurnAction =
  | { type: 'draw' }
  | {
      type: 'play';
      cardIds: number[];
      target?: number;
      namedType?: CardType;
    };

// ---------- Оценка ситуации ----------

/** Сколько крыс осталось в колоде (публичная информация) */
export function ratsInDeck(state: GameState): number {
  const startRats = state.players.length - 1;
  const exploded = state.players.filter((p) => !p.alive).length;
  const inDiscard = state.discard.filter((c) => c.type === 'exploding-rat').length;
  // крысы выбывших лежат в сбросе; считаем через сброс, fallback на exploded
  return startRats - Math.max(exploded, inDiscard);
}

/** Вероятность взрыва при следующем взятии */
export function explodeRisk(state: GameState, mem: BotMemory): number {
  if (mem.knownTop.length > 0 && mem.knownTop[0] !== null) {
    return mem.knownTop[0] === 'exploding-rat' ? 1 : 0;
  }
  const deckSize = state.deck.length;
  if (deckSize === 0) return 0;
  return ratsInDeck(state) / deckSize;
}

/** Ценность карты для решений «что отдать/украсть» (больше = ценнее) */
function cardValue(t: CardType): number {
  switch (t) {
    case 'defuse': return 100;
    case 'nope': return 60;
    case 'attack': return 50;
    case 'skip': return 45;
    case 'see-the-future': return 30;
    case 'shuffle': return 25;
    case 'favor': return 20;
    default: return 10; // крысокарты
  }
}

function hasType(p: PlayerState, t: CardType): Card | undefined {
  return p.hand.find((c) => c.type === t);
}

function groupByType(hand: Card[]): Map<CardType, Card[]> {
  const m = new Map<CardType, Card[]>();
  for (const c of hand) {
    const arr = m.get(c.type) ?? [];
    arr.push(c);
    m.set(c.type, arr);
  }
  return m;
}

/** Живые оппоненты, отсортированные по убыванию размера руки */
function opponents(state: GameState, me: number): PlayerState[] {
  return state.players
    .filter((p) => p.alive && p.id !== me)
    .sort((a, b) => b.hand.length - a.hand.length);
}

/** Сколько «Обезвредь» уже ушло в сброс — оценка, у кого они ещё есть */
function defusesBurned(state: GameState): number {
  return state.discard.filter((c) => c.type === 'defuse').length;
}

// ---------- Решения ----------

/**
 * Главное решение хода. Оркестратор зовёт в цикле: бот может сыграть
 * несколько карт, затем вернуть draw.
 */
export function decideTurn(
  state: GameState,
  me: number,
  mem: BotMemory,
  difficulty: Difficulty,
  rand: () => number = Math.random,
): BotTurnAction {
  const p = state.players[me];
  const risk = explodeRisk(state, mem);
  const maxPlays = difficulty === 'hard' ? 3 : 2;
  if (mem.playsThisTurn >= maxPlays || p.hand.length === 0) return { type: 'draw' };

  if (difficulty === 'easy') return decideEasy(state, p, risk, rand);
  return decideSmart(state, p, mem, risk, difficulty, rand);
}

function decideEasy(
  state: GameState,
  p: PlayerState,
  risk: number,
  rand: () => number,
): BotTurnAction {
  // Лёгкий бот часто просто тянет, иногда играет случайную играбельную карту
  if (rand() < 0.55) return { type: 'draw' };
  const playable = p.hand.filter(
    (c) => !CARD_DEFS[c.type].isRatCard && c.type !== 'defuse' && c.type !== 'nope',
  );
  // Паникует при явном риске, если случайно знает про него
  if (risk > 0.5) {
    const escape = playable.find((c) => c.type === 'skip' || c.type === 'attack');
    if (escape && rand() < 0.6) return playSingle(state, p, escape, rand);
  }
  if (playable.length === 0) return { type: 'draw' };
  const card = playable[Math.floor(rand() * playable.length)];
  // Лёгкий бот иногда бессмысленно тратит сильные карты — это и есть его слабость
  return playSingle(state, p, card, rand);
}

function decideSmart(
  state: GameState,
  p: PlayerState,
  mem: BotMemory,
  risk: number,
  difficulty: Difficulty,
  rand: () => number,
): BotTurnAction {
  const me = p.id;
  const hard = difficulty === 'hard';
  const opps = opponents(state, me);
  const groups = groupByType(p.hand);
  const knownRatOnTop = mem.knownTop[0] === 'exploding-rat';
  const threshold = hard ? 0.28 : 0.34;

  // 1. Знаем, что сверху крыса, или риск велик — уходим от взятия
  if (knownRatOnTop || risk > threshold) {
    // Под атакой выгоднее контр-атака: и ходы сбрасываем, и врага заваливаем
    const atk = hasType(p, 'attack');
    if (atk && (state.underAttack || hard || rand() < 0.5))
      return playSingle(state, p, atk, rand);
    const skip = hasType(p, 'skip');
    if (skip) return playSingle(state, p, skip, rand);
    // Затасовать известную крысу
    const sh = hasType(p, 'shuffle');
    if (sh && (knownRatOnTop || risk > 0.5)) return playSingle(state, p, sh, rand);
  }

  // 2. Разведка: не знаем верх, риск заметный — подсматриваем
  const stf = hasType(p, 'see-the-future');
  if (stf && mem.knownTop.length === 0 && risk > (hard ? 0.12 : 0.2)) {
    return playSingle(state, p, stf, rand);
  }

  // 3. Комбинации. Тройка + догадка, что у кого-то есть «Обезвредь»
  for (const [type, cards] of groups) {
    if (type === 'defuse' || type === 'nope') continue;
    if (cards.length >= 3 && opps.length > 0) {
      const wantDefuse = defusesBurned(state) < 4; // ещё гуляют по рукам
      if (hard && wantDefuse) {
        const target = opps[0];
        return {
          type: 'play',
          cardIds: cards.slice(0, 3).map((c) => c.id),
          target: target.id,
          namedType: 'defuse',
        };
      }
    }
    // Пара крысокарт — украсть случайную у самого «толстого» оппонента
    if (
      cards.length >= 2 &&
      RAT_CARD_TYPES.includes(type) &&
      opps.length > 0 &&
      opps[0].hand.length > 0 &&
      (hard || rand() < 0.6)
    ) {
      return {
        type: 'play',
        cardIds: cards.slice(0, 2).map((c) => c.id),
        target: opps[0].id,
      };
    }
  }

  // 4. «Подлижись», если своя рука бедна, а у врага есть чем поживиться
  const fav = hasType(p, 'favor');
  if (fav && opps.length > 0 && opps[0].hand.length >= 3 && p.hand.length <= 4 && rand() < 0.7) {
    return { type: 'play', cardIds: [fav.id], target: opps[0].id };
  }

  // 5. Сложный бот агрессивно нападает в эндшпиле (мало карт в колоде = высокая плотность крыс)
  if (hard) {
    const atk = hasType(p, 'attack');
    const lateGame = state.deck.length > 0 && ratsInDeck(state) / state.deck.length > 0.2;
    if (atk && lateGame && rand() < 0.5) return playSingle(state, p, atk, rand);
  }

  return { type: 'draw' };
}

function playSingle(
  state: GameState,
  p: PlayerState,
  card: Card,
  rand: () => number,
): BotTurnAction {
  if (card.type === 'favor') {
    const opps = opponents(state, p.id).filter((o) => o.hand.length > 0);
    if (opps.length === 0) return { type: 'draw' };
    const target = opps[Math.floor(rand() * opps.length)];
    return { type: 'play', cardIds: [card.id], target: target.id };
  }
  return { type: 'play', cardIds: [card.id] };
}

/** Играть ли «Неть» против pending-действия */
export function decideNope(
  state: GameState,
  me: number,
  pending: PendingAction,
  difficulty: Difficulty,
  rand: () => number = Math.random,
): boolean {
  const p = state.players[me];
  if (!p.alive || !p.hand.some((c) => c.type === 'nope')) return false;
  if (pending.player === me) {
    // Контр-неть на «Неть», отменившую МОЁ действие
    const cancelled = pending.nopeChain.length % 2 === 1;
    if (!cancelled) return false;
    const chance = difficulty === 'hard' ? 0.9 : difficulty === 'medium' ? 0.5 : 0.1;
    return rand() < chance;
  }
  // Действие сейчас в силе? Если уже отменено чужой «Нетью» — не тратимся
  if (pending.nopeChain.length % 2 === 1) return false;

  const targetsMe = pending.target === me;
  const nextAlive = nextAlivePlayer(state, pending.player);
  const attackHitsMe = pending.kind === 'attack' && nextAlive === me;
  const dangerous =
    (targetsMe && (pending.kind === 'favor' || pending.kind === 'combo2' || pending.kind === 'combo3')) ||
    attackHitsMe;

  switch (difficulty) {
    case 'easy':
      return dangerous && rand() < 0.15;
    case 'medium':
      return dangerous && rand() < 0.6;
    case 'hard': {
      if (dangerous) return rand() < 0.9;
      // Сложный бот мешает и чужим сильным ходам (combo5, кража у слабого)
      if (pending.kind === 'combo5') return rand() < 0.35;
      return false;
    }
  }
}

function nextAlivePlayer(state: GameState, from: number): number {
  let next = from;
  do {
    next = (next + 1) % state.players.length;
  } while (!state.players[next].alive);
  return next;
}

/**
 * Куда вернуть крысу после «Обезвредь».
 * Возвращает позицию 0..deckSize (0 = верх).
 */
export function decideDefusePosition(
  state: GameState,
  difficulty: Difficulty,
  rand: () => number = Math.random,
): number {
  const size = state.deck.length;
  switch (difficulty) {
    case 'easy':
      return Math.floor(rand() * (size + 1)); // куда попало
    case 'medium':
      // не себе: не глубже, чем через одного
      return rand() < 0.7 ? 0 : Math.min(1, size);
    case 'hard':
      // Крыса — следующему: верх, изредка вторая сверху, чтобы не читались паттерны
      return rand() < 0.8 ? 0 : Math.min(1, size);
  }
}

/** «Подлижись»: какую карту отдать (самую бесполезную) */
export function decideFavorGive(p: PlayerState): number {
  const sorted = [...p.hand].sort((a, b) => cardValue(a.type) - cardValue(b.type));
  return sorted[0].id;
}

/** Комбо из 5: что взять из сброса (самое ценное) */
export function decidePickDiscard(discard: Card[]): number {
  const sorted = [...discard].sort((a, b) => cardValue(b.type) - cardValue(a.type));
  return sorted[0].id;
}
