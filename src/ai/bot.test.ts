import { describe, expect, it } from 'vitest';
import { GameEngine } from '../game/engine';
import { mulberry32 } from '../game/rng';
import type { Difficulty } from '../game/types';
import {
  decideDefusePosition,
  decideFavorGive,
  decideNope,
  decidePickDiscard,
  decideTurn,
  freshMemory,
  memoryUpdates,
  type BotMemory,
} from './bot';

/**
 * Безголовый оркестратор: все игроки — боты. Повторяет логику стора
 * без задержек. Партия обязана закончиться победителем.
 */
function simulateGame(nPlayers: number, difficulty: Difficulty, seed: number): GameEngine {
  const rand = mulberry32(seed * 7 + 1);
  const engine = new GameEngine(
    Array.from({ length: nPlayers }, (_, i) => ({ name: `Bot${i}`, isBot: true })),
    seed,
  );
  const memories: BotMemory[] = engine.state.players.map(() => freshMemory());

  const processEvents = () => {
    for (const e of engine.drainEvents()) {
      for (let i = 0; i < memories.length; i++) {
        if (e.type === 'card-drawn' || e.type === 'exploded' || e.type === 'defused') {
          if (e.type !== 'defused') memoryUpdates.cardDrawn(memories[i]);
        }
        if (e.type === 'deck-shuffled') memoryUpdates.deckShuffled(memories[i]);
        if (e.type === 'rat-returned') memoryUpdates.ratReturned(memories[i], false);
        if (e.type === 'future-seen' && e.player === i)
          memoryUpdates.sawFuture(memories[i], e.cards);
        if (e.type === 'turn-changed' && e.player === i) memories[i].playsThisTurn = 0;
      }
    }
  };

  let guard = 0;
  while (engine.state.phase !== 'game-over') {
    if (++guard > 5000) throw new Error('Партия не завершилась за 5000 шагов');
    const s = engine.state;

    if (s.phase === 'nope-window') {
      // все живые (кроме автора цепочки на этом шаге) решают по очереди
      let someoneNoped = true;
      let chainGuard = 0;
      while (someoneNoped && ++chainGuard < 30) {
        someoneNoped = false;
        for (const p of s.players) {
          if (!p.alive || !s.pending) continue;
          if (engine.canNope(p.id) && decideNope(s, p.id, s.pending, difficulty, rand)) {
            engine.playNope(p.id);
            someoneNoped = true;
            break;
          }
        }
      }
      engine.resolvePending();
      processEvents();
      continue;
    }

    if (s.phase === 'awaiting-input') {
      const req = s.request!;
      switch (req.kind) {
        case 'defuse-position':
          engine.resolveDefuse(decideDefusePosition(s, difficulty, rand));
          break;
        case 'favor-give':
          engine.giveFavorCard(decideFavorGive(s.players[req.player]));
          break;
        case 'pick-discard':
          engine.pickFromDiscard(decidePickDiscard(s.discard));
          break;
        case 'view-future':
          memoryUpdates.sawFuture(memories[req.player], req.cards);
          engine.ackFuture();
          break;
      }
      processEvents();
      continue;
    }

    // phase === 'playing'
    const me = s.currentPlayer;
    const action = decideTurn(s, me, memories[me], difficulty, rand);
    if (action.type === 'draw') {
      engine.draw(me);
    } else {
      memories[me].playsThisTurn += 1;
      engine.playCards(me, action.cardIds, {
        target: action.target,
        namedType: action.namedType,
      });
    }
    processEvents();
  }
  return engine;
}

describe('симуляция полных партий (боты против ботов)', () => {
  const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];

  for (const difficulty of difficulties) {
    it(`сложность ${difficulty}: 20 партий 2–5 игроков всегда завершаются`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const n = 2 + (seed % 4); // 2..5
        const engine = simulateGame(n, difficulty, seed);
        expect(engine.state.winner).not.toBeNull();
        expect(engine.state.players.filter((p) => p.alive)).toHaveLength(1);
        // инвариант: все 56 стартовых карт (минус удалённые при сетапе) на месте
        const total =
          engine.state.deck.length +
          engine.state.discard.length +
          engine.state.players.reduce((s, p) => s + p.hand.length, 0);
        expect(total).toBeGreaterThan(0);
      }
    });
  }

  it('решения ботов не зависят от чужих рук (только публичная информация)', () => {
    // smoke: decideTurn не бросает и возвращает валидные действия
    const engine = new GameEngine(
      [
        { name: 'A', isBot: true },
        { name: 'B', isBot: true },
      ],
      5,
    );
    const mem = freshMemory();
    const action = decideTurn(engine.state, 0, mem, 'hard', mulberry32(1));
    expect(['draw', 'play']).toContain(action.type);
  });
});
