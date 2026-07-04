import { describe, expect, it } from 'vitest';
import { GameEngine } from './engine';
import { buildFullDeck, setupGame } from './setup';
import { mulberry32 } from './rng';
import { CARD_DEFS, TOTAL_CARDS } from '../data/cards';
import type { Card } from './types';
import type { CardType } from '../data/cards';

const specs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isBot: i > 0 }));

/** Подсунуть игроку нужные карты (для детерминизма) */
let nextTestId = 1000;
function giveCards(engine: GameEngine, player: number, types: CardType[]): Card[] {
  const cards = types.map((type) => ({ id: nextTestId++, type }));
  engine.state.players[player].hand.push(...cards);
  return cards;
}

function setDeck(engine: GameEngine, types: CardType[]): void {
  let id = 9000;
  engine.state.deck.length = 0;
  engine.state.deck.push(...types.map((type) => ({ id: id++, type })));
}

describe('состав колоды («Крысиная возня», 110 карт)', () => {
  it('полная колода — ровно 110 карт с правильными количествами', () => {
    expect(TOTAL_CARDS).toBe(110);
    const deck = buildFullDeck();
    expect(deck).toHaveLength(110);
    const count = (t: CardType) => deck.filter((c) => c.type === t).length;
    expect(count('exploding-rat')).toBe(8);
    expect(count('defuse')).toBe(10);
    for (const t of ['attack', 'skip', 'favor', 'shuffle', 'see-the-future', 'nope'] as CardType[])
      expect(count(t)).toBe(10);
    for (let k = 1; k <= 8; k++)
      expect(count(`rat-${k}` as CardType)).toBe(4);
  });

  it('у каждой копии свой номер арта (variant = 1..count)', () => {
    const deck = buildFullDeck();
    const nopes = deck.filter((c) => c.type === 'nope').map((c) => c.variant);
    expect([...nopes].sort((a, b) => a! - b!)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('подготовка партии', () => {
  it.each([2, 3, 4, 5])('%i игроков: по 8 карт, ровно 1 обезвредь на руке', (n) => {
    const { players, deck } = setupGame(specs(n), mulberry32(1));
    for (const p of players) {
      expect(p.hand).toHaveLength(8);
      expect(p.hand.filter((c) => c.type === 'defuse')).toHaveLength(1);
      expect(p.hand.some((c) => c.type === 'exploding-rat')).toBe(false);
    }
    expect(deck.filter((c) => c.type === 'exploding-rat')).toHaveLength(n - 1);
  });

  it('2–3 игрока: в колоде только 2 запасных «Обезвредь»', () => {
    for (const n of [2, 3]) {
      const { deck } = setupGame(specs(n), mulberry32(7));
      expect(deck.filter((c) => c.type === 'defuse')).toHaveLength(2);
    }
  });

  it('4–5 игроков: запасных «Крыса, живи!» в колоде (6 − игроки)', () => {
    for (const n of [4, 5]) {
      const { deck } = setupGame(specs(n), mulberry32(7));
      expect(deck.filter((c) => c.type === 'defuse')).toHaveLength(6 - n);
    }
  });

  it.each([2, 3, 4, 5])(
    '%i игроков: добор урезан до классической плотности',
    (n) => {
      const { deck } = setupGame(specs(n), mulberry32(3));
      const defusesBack = n <= 3 ? 2 : 6 - n;
      expect(deck).toHaveLength(46 - 7 * n + defusesBack + (n - 1));
    },
  );
});

describe('стак «Нападай»', () => {
  it('обычная атака: следующий игрок делает 2 хода', () => {
    const e = new GameEngine(specs(3), 42);
    const [atk] = giveCards(e, 0, ['attack']);
    e.playCards(0, [atk.id]);
    e.resolvePending();
    expect(e.state.currentPlayer).toBe(1);
    expect(e.state.turnsRemaining).toBe(2);
    expect(e.state.underAttack).toBe(true);
  });

  it('атака в ответ на атаку (первым ходом): следующий делает 4 хода', () => {
    const e = new GameEngine(specs(3), 42);
    const [a0] = giveCards(e, 0, ['attack']);
    const [a1] = giveCards(e, 1, ['attack']);
    e.playCards(0, [a0.id]);
    e.resolvePending();
    // P1 под атакой (2 хода), сразу отвечает атакой
    e.playCards(1, [a1.id]);
    e.resolvePending();
    expect(e.state.currentPlayer).toBe(2);
    expect(e.state.turnsRemaining).toBe(4); // 2 (остаток) + 2
  });

  it('атака на втором из двух ходов: следующий делает 3, не 4 (пример из правил)', () => {
    const e = new GameEngine(specs(3), 42);
    const [a0] = giveCards(e, 0, ['attack']);
    const [a1] = giveCards(e, 1, ['attack']);
    setDeck(e, ['rat-1', 'rat-2', 'rat-3', 'rat-4']);
    e.playCards(0, [a0.id]);
    e.resolvePending();
    e.draw(1); // первый из 2 ходов выполнен взятием
    expect(e.state.currentPlayer).toBe(1);
    expect(e.state.turnsRemaining).toBe(1);
    e.playCards(1, [a1.id]); // атака на втором ходу
    e.resolvePending();
    expect(e.state.currentPlayer).toBe(2);
    expect(e.state.turnsRemaining).toBe(3); // 1 (остаток) + 2
  });

  it('«Нападай» завершает ход без взятия карты', () => {
    const e = new GameEngine(specs(3), 42);
    const [atk] = giveCards(e, 0, ['attack']);
    const handBefore = e.state.players[0].hand.length;
    const deckBefore = e.state.deck.length;
    e.playCards(0, [atk.id]);
    e.resolvePending();
    expect(e.state.players[0].hand.length).toBe(handBefore - 1);
    expect(e.state.deck.length).toBe(deckBefore);
  });
});

describe('«Слиняй»', () => {
  it('завершает ход без взятия', () => {
    const e = new GameEngine(specs(3), 42);
    const [skip] = giveCards(e, 0, ['skip']);
    const deckBefore = e.state.deck.length;
    e.playCards(0, [skip.id]);
    e.resolvePending();
    expect(e.state.currentPlayer).toBe(1);
    expect(e.state.deck.length).toBe(deckBefore);
  });

  it('под «Нападай» гасит только один из двух ходов', () => {
    const e = new GameEngine(specs(3), 42);
    const [atk] = giveCards(e, 0, ['attack']);
    const [skip] = giveCards(e, 1, ['skip']);
    e.playCards(0, [atk.id]);
    e.resolvePending();
    e.playCards(1, [skip.id]);
    e.resolvePending();
    // всё ещё ход P1 — остался 1 ход
    expect(e.state.currentPlayer).toBe(1);
    expect(e.state.turnsRemaining).toBe(1);
  });
});

describe('цепочка «Неть»', () => {
  it('одна «Неть» отменяет действие', () => {
    const e = new GameEngine(specs(3), 42);
    const [atk] = giveCards(e, 0, ['attack']);
    giveCards(e, 1, ['nope']);
    e.playCards(0, [atk.id]);
    e.playNope(1);
    e.resolvePending();
    // атака отменена: ход всё ещё у P0, он обязан взять карту
    expect(e.state.currentPlayer).toBe(0);
    expect(e.state.turnsRemaining).toBe(1);
  });

  it('«Неть» на «Неть» — действие снова работает', () => {
    const e = new GameEngine(specs(3), 42);
    const [atk] = giveCards(e, 0, ['attack']);
    giveCards(e, 1, ['nope']);
    giveCards(e, 0, ['nope']);
    e.playCards(0, [atk.id]);
    e.playNope(1);
    e.playNope(0); // контр-неть от автора
    e.resolvePending();
    expect(e.state.currentPlayer).toBe(1);
    expect(e.state.turnsRemaining).toBe(2);
  });

  it('цепочка любой длины: нечётное = отменено, чётное = работает', () => {
    const e = new GameEngine(specs(3), 42);
    const [atk] = giveCards(e, 0, ['attack']);
    giveCards(e, 1, ['nope', 'nope']);
    giveCards(e, 2, ['nope']);
    e.playCards(0, [atk.id]);
    e.playNope(1);
    e.playNope(2);
    e.playNope(1); // 3 «Неть» — нечётно, действие отменено
    e.resolvePending();
    expect(e.state.currentPlayer).toBe(0);
  });

  it('сыгранные карты уходят в сброс даже при отмене', () => {
    const e = new GameEngine(specs(3), 42);
    const [sh] = giveCards(e, 0, ['shuffle']);
    giveCards(e, 1, ['nope']);
    e.playCards(0, [sh.id]);
    e.playNope(1);
    e.resolvePending();
    expect(e.state.discard.some((c) => c.id === sh.id)).toBe(true);
    expect(e.state.players[0].hand.some((c) => c.id === sh.id)).toBe(false);
  });
});

describe('взрыв и «Обезвредь»', () => {
  it('крыса без обезвреживания: игрок выбывает, карты в сброс', () => {
    const e = new GameEngine(specs(3), 42);
    const p0 = e.state.players[0];
    p0.hand = p0.hand.filter((c) => c.type !== 'defuse');
    const handSize = p0.hand.length;
    setDeck(e, ['exploding-rat']);
    const discardBefore = e.state.discard.length;
    e.draw(0);
    expect(p0.alive).toBe(false);
    expect(p0.hand).toHaveLength(0);
    expect(e.state.discard.length).toBe(discardBefore + handSize + 1);
    expect(e.state.currentPlayer).toBe(1);
  });

  it('обезвреживание: выбор позиции возврата, ход завершается', () => {
    const e = new GameEngine(specs(3), 42);
    setDeck(e, ['exploding-rat', 'rat-1', 'rat-2']);
    e.draw(0);
    expect(e.state.phase).toBe('awaiting-input');
    expect(e.state.request?.kind).toBe('defuse-position');
    // вернуть в самый низ (позиция = размер колоды)
    e.resolveDefuse(2);
    expect(e.state.deck[2].type).toBe('exploding-rat');
    expect(e.state.currentPlayer).toBe(1); // ход завершён
    // «Обезвредь» ушла в сброс
    expect(e.state.discard.some((c) => c.type === 'defuse')).toBe(true);
  });

  it('обезвреживание под атакой: гасит один ход, второй остаётся', () => {
    const e = new GameEngine(specs(3), 42);
    const [atk] = giveCards(e, 0, ['attack']);
    e.playCards(0, [atk.id]);
    e.resolvePending();
    setDeck(e, ['exploding-rat', 'rat-1', 'rat-2']);
    e.draw(1);
    e.resolveDefuse(0);
    expect(e.state.currentPlayer).toBe(1);
    expect(e.state.turnsRemaining).toBe(1);
  });

  it('последний выживший побеждает', () => {
    const e = new GameEngine(specs(2), 42);
    const p1 = e.state.players[1];
    p1.hand = p1.hand.filter((c) => c.type !== 'defuse');
    // ход P0: слиняй, затем P1 тянет крысу
    const [skip] = giveCards(e, 0, ['skip']);
    e.playCards(0, [skip.id]);
    e.resolvePending();
    setDeck(e, ['exploding-rat']);
    e.draw(1);
    expect(e.state.phase).toBe('game-over');
    expect(e.state.winner).toBe(0);
  });
});

describe('комбинации', () => {
  it('2 одинаковые: кража случайной карты у выбранного оппонента', () => {
    const e = new GameEngine(specs(3), 42);
    const pair = giveCards(e, 0, ['rat-1', 'rat-1']);
    const targetHand = e.state.players[1].hand.length;
    e.playCards(0, pair.map((c) => c.id), { target: 1 });
    e.resolvePending();
    expect(e.state.players[1].hand.length).toBe(targetHand - 1);
  });

  it('2 одинаковые НЕ-крысокарты тоже работают', () => {
    const e = new GameEngine(specs(3), 42);
    const pair = giveCards(e, 0, ['skip', 'skip']);
    const targetHand = e.state.players[1].hand.length;
    e.playCards(0, pair.map((c) => c.id), { target: 1 });
    e.resolvePending();
    expect(e.state.players[1].hand.length).toBe(targetHand - 1);
    // эффект «Слиняй» игнорируется: ход по-прежнему у P0
    expect(e.state.currentPlayer).toBe(0);
  });

  it('3 одинаковые: названная карта переходит, если есть', () => {
    const e = new GameEngine(specs(3), 42);
    const triple = giveCards(e, 0, ['rat-2', 'rat-2', 'rat-2']);
    giveCards(e, 1, ['see-the-future']);
    e.playCards(0, triple.map((c) => c.id), { target: 1, namedType: 'see-the-future' });
    e.resolvePending();
    expect(e.state.players[0].hand.some((c) => c.type === 'see-the-future')).toBe(true);
  });

  it('3 одинаковые: если названной карты нет — ничего не происходит', () => {
    const e = new GameEngine(specs(3), 42);
    const triple = giveCards(e, 0, ['rat-2', 'rat-2', 'rat-2']);
    const p1 = e.state.players[1];
    p1.hand = p1.hand.filter((c) => c.type !== 'nope');
    const before = p1.hand.length;
    e.playCards(0, triple.map((c) => c.id), { target: 1, namedType: 'nope' });
    e.resolvePending();
    expect(p1.hand.length).toBe(before);
  });

  it('5 разных: взять любую карту из сброса', () => {
    const e = new GameEngine(specs(3), 42);
    e.state.discard.push({ id: 777, type: 'defuse' });
    const five = giveCards(e, 0, ['rat-1', 'rat-2', 'rat-3', 'skip', 'shuffle']);
    e.playCards(0, five.map((c) => c.id));
    e.resolvePending();
    expect(e.state.request?.kind).toBe('pick-discard');
    e.pickFromDiscard(777);
    expect(e.state.players[0].hand.some((c) => c.id === 777)).toBe(true);
  });

  it('невалидные наборы отклоняются', () => {
    const e = new GameEngine(specs(3), 42);
    const [r1, s1] = giveCards(e, 0, ['rat-1', 'skip']);
    expect(() => e.playCards(0, [r1.id])).toThrow(); // крысокарта соло
    expect(() => e.playCards(0, [r1.id, s1.id], { target: 1 })).toThrow(); // 2 разные
    const d = e.state.players[0].hand.find((c) => c.type === 'defuse')!;
    expect(() => e.playCards(0, [d.id])).toThrow(); // обезвредь добровольно
  });
});

describe('«Подлижись» и пустые руки', () => {
  it('цель сама выбирает карту, которую отдаст', () => {
    const e = new GameEngine(specs(3), 42);
    const [fav] = giveCards(e, 0, ['favor']);
    e.playCards(0, [fav.id], { target: 1 });
    e.resolvePending();
    expect(e.state.request?.kind).toBe('favor-give');
    const give = e.state.players[1].hand[0];
    e.giveFavorCard(give.id);
    expect(e.state.players[0].hand.some((c) => c.id === give.id)).toBe(true);
  });

  it('«Подлижись» на игрока с пустой рукой — без эффекта', () => {
    const e = new GameEngine(specs(3), 42);
    const [fav] = giveCards(e, 0, ['favor']);
    e.state.players[1].hand = [];
    e.playCards(0, [fav.id], { target: 1 });
    e.resolvePending();
    expect(e.state.request).toBeNull();
    expect(e.state.phase).toBe('playing');
  });

  it('кража у игрока с пустой рукой — без эффекта', () => {
    const e = new GameEngine(specs(3), 42);
    const pair = giveCards(e, 0, ['rat-3', 'rat-3']);
    e.state.players[1].hand = [];
    const myHand = e.state.players[0].hand.length;
    e.playCards(0, pair.map((c) => c.id), { target: 1 });
    e.resolvePending();
    expect(e.state.players[0].hand.length).toBe(myHand - 2);
  });
});

describe('крайние случаи колоды', () => {
  it('«Подсмотри грядущее» при короткой колоде показывает сколько есть', () => {
    const e = new GameEngine(specs(3), 42);
    const [stf] = giveCards(e, 0, ['see-the-future']);
    setDeck(e, ['rat-1', 'exploding-rat']);
    e.playCards(0, [stf.id]);
    e.resolvePending();
    const req = e.state.request;
    expect(req?.kind).toBe('view-future');
    if (req?.kind === 'view-future') expect(req.cards).toHaveLength(2);
    e.ackFuture();
    expect(e.state.phase).toBe('playing');
  });

  it('«Затасуй» на пустой колоде не падает', () => {
    const e = new GameEngine(specs(3), 42);
    const [sh] = giveCards(e, 0, ['shuffle']);
    e.state.deck.length = 0;
    e.playCards(0, [sh.id]);
    e.resolvePending();
    expect(e.state.phase).toBe('playing');
  });

  it('игрок без карт может только взять карту', () => {
    const e = new GameEngine(specs(3), 42);
    e.state.players[0].hand = [];
    setDeck(e, ['rat-4', 'rat-5']);
    e.draw(0);
    expect(e.state.players[0].hand).toHaveLength(1);
    expect(e.state.currentPlayer).toBe(1);
  });
});

describe('forfeit (выход из мультиплеера)', () => {
  it('игрок выбывает, карты в сброс, ход передаётся', () => {
    const e = new GameEngine(specs(3), 42);
    const handSize = e.state.players[0].hand.length;
    const discardBefore = e.state.discard.length;
    e.forfeit(0);
    expect(e.state.players[0].alive).toBe(false);
    expect(e.state.discard.length).toBe(discardBefore + handSize);
    expect(e.state.currentPlayer).toBe(1);
  });

  it('выход предпоследнего игрока завершает партию', () => {
    const e = new GameEngine(specs(2), 42);
    e.forfeit(1);
    expect(e.state.phase).toBe('game-over');
    expect(e.state.winner).toBe(0);
  });

  it('выход во время своего окна «Неть» снимает pending', () => {
    const e = new GameEngine(specs(3), 42);
    const [atk] = giveCards(e, 0, ['attack']);
    e.playCards(0, [atk.id]);
    expect(e.state.phase).toBe('nope-window');
    e.forfeit(0);
    expect(e.state.pending).toBeNull();
    expect(e.state.players[0].alive).toBe(false);
  });
});

describe('манифест карт', () => {
  it('описания и основы имён файлов заданы для всех типов', () => {
    for (const def of Object.values(CARD_DEFS)) {
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.imageStem).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
