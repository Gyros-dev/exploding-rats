import { ALL_CARD_TYPES, CARD_DEFS } from '../data/cards';
import type { Card, PlayerState } from './types';
import { shuffleInPlace, type Rng } from './rng';

export interface SetupPlayerSpec {
  name: string;
  isBot: boolean;
  avatarUrl?: string;
}

export interface SetupResult {
  players: PlayerState[];
  deck: Card[];
}

/** Полная колода из 110 карт (id уникальны, у каждой копии свой арт) */
export function buildFullDeck(): Card[] {
  const cards: Card[] = [];
  let id = 0;
  for (const type of ALL_CARD_TYPES) {
    for (let i = 0; i < CARD_DEFS[type].count; i++) {
      cards.push({ id: id++, type, variant: i + 1 });
    }
  }
  return cards;
}

/**
 * Подготовка партии по правилам, адаптированная под набор «Крысиная возня»
 * (110 карт — физическая колода рассчитана на большие компании):
 * 1. Убрать все «Смертельные кринжи» (8) и «Крыса, живи!» (10).
 * 2. Перемешать остаток, раздать по 7 карт.
 * 3. Выдать каждому 1 «Крыса, живи!» (на руке 8).
 * 4. Добор УРЕЗАТЬ до классической плотности (46 − 7×игроки), лишние карты
 *    уходят из партии — иначе на 2–5 игроков кринжи размажутся по огромной
 *    колоде и партия затянется. Каждый раз выпадает случайное подмножество,
 *    так что все 110 артов ротируются между партиями.
 * 5. Запасные «Крыса, живи!» — в колоду: при 2–3 игроках 2, при 4–5 — (6 − игроки).
 * 6. Замешать кринжи числом (игроки − 1), лишние удалить.
 * 7. Перемешать колоду.
 */
export function setupGame(specs: SetupPlayerSpec[], rng: Rng): SetupResult {
  const n = specs.length;
  if (n < 2 || n > 5) throw new Error('Игроков должно быть от 2 до 5');

  const full = buildFullDeck();
  const rats = full.filter((c) => c.type === 'exploding-rat');
  const defuses = full.filter((c) => c.type === 'defuse');
  const rest = full.filter(
    (c) => c.type !== 'exploding-rat' && c.type !== 'defuse',
  );

  shuffleInPlace(rest, rng);

  const players: PlayerState[] = specs.map((s, i) => ({
    id: i,
    name: s.name,
    isBot: s.isBot,
    avatarUrl: s.avatarUrl,
    hand: [],
    alive: true,
  }));

  // По 7 карт каждому
  for (const p of players) {
    p.hand = rest.splice(0, 7);
  }
  // По одной «Обезвредь» каждому
  for (const p of players) {
    p.hand.push(defuses.shift()!);
  }

  // Урезаем добор до классической плотности (rest уже перемешан —
  // остаётся случайное подмножество)
  const deck = rest.slice(0, Math.max(0, 46 - 7 * n));

  // Запасные «Крыса, живи!»: при 2–3 игроках только 2, при 4–5 — (6 − n)
  deck.push(...defuses.slice(0, n <= 3 ? 2 : 6 - n));

  // Кринжи: (игроки − 1), лишние удаляются из игры
  deck.push(...rats.slice(0, n - 1));

  shuffleInPlace(deck, rng);

  return { players, deck };
}
