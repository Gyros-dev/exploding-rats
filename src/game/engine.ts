import { CARD_DEFS, type CardType } from '../data/cards';
import type {
  Card,
  GameEvent,
  GameState,
  InputRequest,
  PendingAction,
  PlayedActionKind,
  PlayerState,
} from './types';
import { mulberry32, randInt, shuffleInPlace, type Rng } from './rng';
import { setupGame, type SetupPlayerSpec } from './setup';

export interface PlayOptions {
  target?: number;
  namedType?: CardType;
}

/**
 * Игровой движок «Взрывных крыс». Полностью детерминирован при заданном seed.
 *
 * Оркестрация (стор/боты) работает так:
 *  - playCards() открывает окно «Неть» (phase = 'nope-window');
 *  - желающие вызывают playNope(), затем оркестратор вызывает resolvePending();
 *  - если движку нужен ввод (обезвредь/подлижись/сброс/будущее) —
 *    phase = 'awaiting-input', ответ через resolveDefuse/giveFavorCard/
 *    pickFromDiscard/ackFuture;
 *  - draw() завершает один ход текущего игрока.
 *
 * События копятся в очереди и выгребаются оркестратором через drainEvents()
 * для анимаций, звука и haptic'ов.
 */
export class GameEngine {
  readonly state: GameState;
  private rng: Rng;
  private events: GameEvent[] = [];
  private logId = 0;

  constructor(specsOrSave: SetupPlayerSpec[] | { restore: GameState }, seed: number) {
    this.rng = mulberry32(seed);
    if (!Array.isArray(specsOrSave)) {
      // Восстановление сохранённой партии: состояние — чистые данные,
      // ГПСЧ продолжает с нового seed (на честность не влияет)
      this.state = specsOrSave.restore;
      this.logId = Math.max(0, ...this.state.log.map((e) => e.id)) + 1;
      this.log('Партия восстановлена — продолжаем!');
      return;
    }
    const { players, deck } = setupGame(specsOrSave, this.rng);
    this.state = {
      players,
      deck,
      discard: [],
      currentPlayer: 0,
      turnsRemaining: 1,
      underAttack: false,
      phase: 'playing',
      pending: null,
      request: null,
      winner: null,
      log: [],
      turnNumber: 1,
    };
    this.log(`Партия началась: ${players.length} игроков, в колоде ${deck.length} карт.`);
  }

  // ---------- Публичные геттеры ----------

  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  player(idx: number): PlayerState {
    return this.state.players[idx];
  }

  aliveCount(): number {
    return this.state.players.filter((p) => p.alive).length;
  }

  /** Игроки, у которых есть «Неть» и которые могут её сыграть сейчас */
  canNope(idx: number): boolean {
    const p = this.state.players[idx];
    return (
      this.state.phase === 'nope-window' &&
      p.alive &&
      p.hand.some((c) => c.type === 'nope')
    );
  }

  /**
   * Проверка набора карт на валидную игру. Возвращает kind или ошибку.
   * Инструкции на картах в комбинациях игнорируются (правило).
   */
  classifyPlay(cards: Card[]): { kind: PlayedActionKind } | { error: string } {
    if (cards.length === 1) {
      const t = cards[0].type;
      if (t === 'defuse')
        return { error: `«${CARD_DEFS.defuse.name}» играется только против кринжа` };
      if (t === 'nope')
        return { error: `«${CARD_DEFS.nope.name}» играется в ответ на чужую карту` };
      if (t === 'exploding-rat') return { error: 'Эту карту нельзя разыграть' };
      if (CARD_DEFS[t].isRatCard)
        return { error: 'Крысокарты играются только парами, тройками или в наборе из 5 разных' };
      return { kind: t as PlayedActionKind };
    }
    if (cards.length === 2 || cards.length === 3) {
      const t = cards[0].type;
      if (t === 'exploding-rat') return { error: 'Эту карту нельзя разыграть' };
      if (!cards.every((c) => c.type === t))
        return { error: 'Для комбинации нужны карты с одинаковым названием' };
      return { kind: cards.length === 2 ? 'combo2' : 'combo3' };
    }
    if (cards.length === 5) {
      const types = new Set(cards.map((c) => c.type));
      if (types.size !== 5) return { error: 'Нужно 5 карт с РАЗНЫМИ названиями' };
      if (types.has('exploding-rat')) return { error: 'Эту карту нельзя разыграть' };
      return { kind: 'combo5' };
    }
    return { error: 'Так сыграть нельзя: 1 карта, 2–3 одинаковые или 5 разных' };
  }

  // ---------- Игра карт ----------

  /**
   * Текущий игрок разыгрывает карту или комбинацию.
   * Карты сразу уходят в сброс; эффект применится в resolvePending(),
   * если его не отменят «Нетью».
   */
  playCards(playerIdx: number, cardIds: number[], opts: PlayOptions = {}): void {
    this.assertPhase('playing');
    if (playerIdx !== this.state.currentPlayer)
      throw new Error('Сейчас не ваш ход');
    const p = this.state.players[playerIdx];
    const cards = cardIds.map((id) => {
      const c = p.hand.find((h) => h.id === id);
      if (!c) throw new Error('Карты нет на руке');
      return c;
    });
    const res = this.classifyPlay(cards);
    if ('error' in res) throw new Error(res.error);
    const { kind } = res;

    const needsTarget = kind === 'favor' || kind === 'combo2' || kind === 'combo3';
    if (needsTarget) {
      const t = opts.target;
      if (t === undefined || t === playerIdx || !this.state.players[t]?.alive)
        throw new Error('Нужно выбрать живого оппонента');
    }
    if (kind === 'combo3' && !opts.namedType)
      throw new Error('Назовите желаемую карту');

    // Карты уходят в сброс независимо от исхода «Неть»
    p.hand = p.hand.filter((c) => !cardIds.includes(c.id));
    this.state.discard.push(...cards);

    this.state.pending = {
      kind,
      player: playerIdx,
      cards,
      target: opts.target,
      namedType: opts.namedType,
      nopeChain: [],
    };
    this.state.phase = 'nope-window';
    this.emit({ type: 'cards-played', player: playerIdx, cards, kind });
    this.log(this.describePlay(playerIdx, kind, cards, opts), playerIdx);
  }

  /** Любой живой игрок с «Нетью» может вклиниться, пока открыто окно */
  playNope(playerIdx: number): void {
    this.assertPhase('nope-window');
    const p = this.state.players[playerIdx];
    if (!p.alive) throw new Error('Игрок выбыл');
    const nope = p.hand.find((c) => c.type === 'nope');
    if (!nope) throw new Error(`Нет карты «${CARD_DEFS.nope.name}»`);
    p.hand = p.hand.filter((c) => c.id !== nope.id);
    this.state.discard.push(nope);
    const pending = this.state.pending!;
    pending.nopeChain.push(playerIdx);
    this.emit({
      type: 'nope-played',
      player: playerIdx,
      card: nope,
      chainLength: pending.nopeChain.length,
    });
    const odd = pending.nopeChain.length % 2 === 1;
    this.log(
      `${p.name}: «${CARD_DEFS.nope.name}!» ${odd ? '— действие отменяется' : '— ответ перебит, действие снова в силе'}`,
      playerIdx,
    );
  }

  /**
   * Закрыть окно «Неть» и применить (или отменить) действие.
   * Нечётная длина цепочки = действие отменено.
   */
  resolvePending(): void {
    this.assertPhase('nope-window');
    const pending = this.state.pending!;
    this.state.pending = null;
    this.state.phase = 'playing';

    if (pending.nopeChain.length % 2 === 1) {
      this.emit({ type: 'action-cancelled', kind: pending.kind, player: pending.player });
      return; // карты уже в сбросе, ход продолжается
    }
    this.emit({ type: 'action-resolved', kind: pending.kind, player: pending.player });
    this.applyAction(pending);
  }

  private applyAction(a: PendingAction): void {
    const s = this.state;
    const actor = s.players[a.player];
    switch (a.kind) {
      case 'attack': {
        // Стак «Нападай»: обычно следующий получает 2 хода; если игравший сам
        // был под атакой — его невзятые ходы переходят следующему (+2).
        // Пример из правил: на втором из двух ходов остаток = 1 → следующий делает 3.
        const nextTurns = s.underAttack ? s.turnsRemaining + 2 : 2;
        this.advanceTurn(nextTurns, true);
        break;
      }
      case 'skip': {
        // Гасит ровно один ход, карту не берём
        s.turnsRemaining -= 1;
        if (s.turnsRemaining <= 0) {
          this.advanceTurn(1, false);
        } else {
          this.log(
            `${actor.name} чиллит. Осталось ходов: ${s.turnsRemaining}.`,
            a.player,
          );
          this.emit({
            type: 'turn-changed',
            player: s.currentPlayer,
            turns: s.turnsRemaining,
            underAttack: s.underAttack,
          });
        }
        break;
      }
      case 'shuffle': {
        shuffleInPlace(s.deck, this.rng);
        this.emit({ type: 'deck-shuffled', player: a.player });
        this.log(`${actor.name} затасовал колоду.`, a.player);
        break;
      }
      case 'see-the-future': {
        // Пустая/короткая колода — показываем сколько есть
        const top = s.deck.slice(0, 3);
        s.request = { kind: 'view-future', player: a.player, cards: top };
        s.phase = 'awaiting-input';
        this.emit({ type: 'future-seen', player: a.player, cards: top });
        break;
      }
      case 'favor': {
        const target = s.players[a.target!];
        if (target.hand.length === 0) {
          this.log(`У ${target.name} пустая рука — отдавать нечего.`, a.target);
          break;
        }
        s.request = { kind: 'favor-give', player: a.target!, to: a.player };
        s.phase = 'awaiting-input';
        break;
      }
      case 'combo2': {
        const target = s.players[a.target!];
        if (target.hand.length === 0) {
          this.log(`У ${target.name} пустая рука — красть нечего.`, a.target);
          break;
        }
        const idx = randInt(this.rng, target.hand.length);
        const [card] = target.hand.splice(idx, 1);
        actor.hand.push(card);
        this.emit({ type: 'card-stolen', from: a.target!, to: a.player, card, random: true });
        this.log(`${actor.name} крадёт случайную карту у ${target.name}.`, a.player);
        break;
      }
      case 'combo3': {
        const target = s.players[a.target!];
        const card = target.hand.find((c) => c.type === a.namedType);
        if (card) {
          target.hand = target.hand.filter((c) => c.id !== card.id);
          actor.hand.push(card);
          this.emit({ type: 'card-stolen', from: a.target!, to: a.player, card, random: false });
          this.log(
            `${actor.name} требует «${CARD_DEFS[a.namedType!].name}» — ${target.name} отдаёт!`,
            a.player,
          );
        } else {
          this.emit({
            type: 'combo3-miss',
            player: a.player,
            target: a.target!,
            namedType: a.namedType!,
          });
          this.log(
            `${actor.name} требует «${CARD_DEFS[a.namedType!].name}», но у ${target.name} её нет.`,
            a.player,
          );
        }
        break;
      }
      case 'combo5': {
        if (s.discard.length === 0) {
          this.log('Сброс пуст — брать нечего.', a.player);
          break;
        }
        s.request = { kind: 'pick-discard', player: a.player };
        s.phase = 'awaiting-input';
        break;
      }
    }
    this.checkWinner();
  }

  // ---------- Ответы на запросы ввода ----------

  /** «Подсмотри грядущее» просмотрено */
  ackFuture(): void {
    this.expectRequest('view-future');
    this.state.request = null;
    this.state.phase = 'playing';
  }

  /** «Подлижись»: отдающий выбрал карту */
  giveFavorCard(cardId: number): void {
    const req = this.expectRequest('favor-give');
    const giver = this.state.players[req.player];
    const receiver = this.state.players[req.to];
    const card = giver.hand.find((c) => c.id === cardId);
    if (!card) throw new Error('Карты нет на руке');
    giver.hand = giver.hand.filter((c) => c.id !== cardId);
    receiver.hand.push(card);
    this.state.request = null;
    this.state.phase = 'playing';
    this.emit({ type: 'card-given', from: req.player, to: req.to, card });
    this.log(`${giver.name} отдаёт карту игроку ${receiver.name}.`, req.player);
  }

  /** Комбо из 5: взята карта из сброса */
  pickFromDiscard(cardId: number): void {
    const req = this.expectRequest('pick-discard');
    const idx = this.state.discard.findIndex((c) => c.id === cardId);
    if (idx === -1) throw new Error('Такой карты нет в сбросе');
    const [card] = this.state.discard.splice(idx, 1);
    this.state.players[req.player].hand.push(card);
    this.state.request = null;
    this.state.phase = 'playing';
    this.emit({ type: 'discard-taken', player: req.player, card });
    this.log(
      `${this.state.players[req.player].name} забирает «${CARD_DEFS[card.type].name}» из сброса.`,
      req.player,
    );
  }

  /**
   * Возврат крысы после «Обезвредь».
   * position: 0 = верх колоды … deck.length = самый низ.
   */
  resolveDefuse(position: number): void {
    const req = this.expectRequest('defuse-position');
    const pos = Math.max(0, Math.min(position, this.state.deck.length));
    this.state.deck.splice(pos, 0, req.ratCard);
    this.state.request = null;
    this.state.phase = 'playing';
    this.emit({ type: 'rat-returned', player: req.player });
    this.log(
      `${this.state.players[req.player].name} втайне возвращает кринж в колоду…`,
      req.player,
    );
    // Обезвреживание завершает ход (как обычное взятие карты)
    this.finishOneTurn();
  }

  /**
   * Принудительное выбытие (игрок покинул мультиплеер-партию).
   * Карты уходят в сброс, ход при необходимости передаётся дальше.
   */
  forfeit(playerIdx: number): void {
    const s = this.state;
    const p = s.players[playerIdx];
    if (!p.alive || s.phase === 'game-over') return;
    p.alive = false;
    p.eliminatedOrder = s.players.filter((x) => !x.alive).length;
    s.discard.push(...p.hand);
    p.hand = [];
    this.log(`🚪 ${p.name} покидает партию и выбывает.`, playerIdx);
    // выбывший не может держать открытые запросы/окна
    if (s.pending && s.phase === 'nope-window') {
      if (s.pending.player === playerIdx) {
        s.pending = null;
        s.phase = 'playing';
      }
    }
    if (s.request && 'player' in s.request && s.request.player === playerIdx) {
      s.request = null;
      s.phase = 'playing';
    }
    if (!this.checkWinner() && s.currentPlayer === playerIdx) {
      this.advanceTurn(1, false);
    }
  }

  // ---------- Взятие карты ----------

  /** Текущий игрок берёт верхнюю карту — это завершает один его ход */
  draw(playerIdx: number): void {
    this.assertPhase('playing');
    if (playerIdx !== this.state.currentPlayer)
      throw new Error('Сейчас не ваш ход');
    const s = this.state;
    const p = s.players[playerIdx];

    // Защита от пустой колоды (при корректном сетапе крысы гарантируют конец
    // раньше, но обрабатываем аккуратно)
    const card = s.deck.shift();
    if (!card) {
      this.log('Колода пуста — ход завершается без взятия.');
      this.finishOneTurn();
      return;
    }

    if (card.type === 'exploding-rat') {
      // вытянутый кринж показывается всем на весь экран
      this.emit({ type: 'rat-drawn', player: playerIdx, card });
      const defuse = p.hand.find((c) => c.type === 'defuse');
      if (defuse) {
        // «Обезвредь» уходит в сброс, игрок выбирает позицию возврата крысы
        p.hand = p.hand.filter((c) => c.id !== defuse.id);
        s.discard.push(defuse);
        s.request = {
          kind: 'defuse-position',
          player: playerIdx,
          ratCard: card,
          deckSize: s.deck.length,
        };
        s.phase = 'awaiting-input';
        this.emit({ type: 'defused', player: playerIdx });
        this.log(`💀 ${p.name} тянет Смертельный кринж… но крыса живёт!`, playerIdx);
      } else {
        // Взрыв: игрок выбывает, его карты + крыса уходят в сброс
        p.alive = false;
        p.eliminatedOrder =
          s.players.filter((x) => !x.alive).length; // 1 = выбыл первым
        s.discard.push(...p.hand, card);
        p.hand = [];
        this.emit({ type: 'exploded', player: playerIdx });
        this.log(`💀 КРИНЖ! ${p.name} кринжует насмерть и выбывает из игры!`, playerIdx);
        if (!this.checkWinner()) {
          // Оставшиеся ходы взорвавшегося сгорают
          this.advanceTurn(1, false);
        }
      }
      return;
    }

    p.hand.push(card);
    this.emit({ type: 'card-drawn', player: playerIdx, card });
    this.log(`${p.name} берёт карту из колоды.`, playerIdx);
    this.finishOneTurn();
  }

  // ---------- Внутреннее ----------

  /** Завершение одного хода текущего игрока (после взятия/обезвреживания) */
  private finishOneTurn(): void {
    const s = this.state;
    s.turnsRemaining -= 1;
    if (s.turnsRemaining > 0) {
      this.log(
        `${s.players[s.currentPlayer].name} ходит ещё раз (осталось ${s.turnsRemaining}).`,
        s.currentPlayer,
      );
      this.emit({
        type: 'turn-changed',
        player: s.currentPlayer,
        turns: s.turnsRemaining,
        underAttack: s.underAttack,
      });
    } else {
      this.advanceTurn(1, false);
    }
  }

  /** Передать ход следующему живому игроку по часовой стрелке */
  private advanceTurn(turns: number, underAttack: boolean): void {
    const s = this.state;
    if (s.phase === 'game-over') return;
    let next = s.currentPlayer;
    do {
      next = (next + 1) % s.players.length;
    } while (!s.players[next].alive);
    s.currentPlayer = next;
    s.turnsRemaining = turns;
    s.underAttack = underAttack;
    s.turnNumber += 1;
    this.emit({ type: 'turn-changed', player: next, turns, underAttack });
    this.log(
      underAttack
        ? `Ход переходит к ${s.players[next].name} — гоп-стоп, ходов: ${turns}!`
        : `Ход переходит к ${s.players[next].name}.`,
      next,
    );
  }

  private checkWinner(): boolean {
    const alive = this.state.players.filter((p) => p.alive);
    if (alive.length === 1 && this.state.phase !== 'game-over') {
      this.state.phase = 'game-over';
      this.state.winner = alive[0].id;
      this.state.pending = null;
      this.state.request = null;
      this.emit({ type: 'game-over', winner: alive[0].id });
      this.log(`🏆 ${alive[0].name} — последняя выжившая крыса! Победа!`, alive[0].id);
      return true;
    }
    return false;
  }

  private assertPhase(phase: GameState['phase']): void {
    if (this.state.phase !== phase)
      throw new Error(`Неверная фаза: ожидалась ${phase}, сейчас ${this.state.phase}`);
  }

  private expectRequest<K extends InputRequest['kind']>(
    kind: K,
  ): Extract<InputRequest, { kind: K }> {
    const r = this.state.request;
    if (!r || r.kind !== kind) throw new Error(`Нет запроса ${kind}`);
    return r as Extract<InputRequest, { kind: K }>;
  }

  private emit(e: GameEvent): void {
    this.events.push(e);
  }

  private log(text: string, player?: number): void {
    this.state.log.push({ id: this.logId++, text, player });
    if (this.state.log.length > 200) this.state.log.shift();
  }

  private describePlay(
    playerIdx: number,
    kind: PlayedActionKind,
    cards: Card[],
    opts: PlayOptions,
  ): string {
    const name = this.state.players[playerIdx].name;
    const targetName =
      opts.target !== undefined ? this.state.players[opts.target].name : '';
    switch (kind) {
      case 'attack':
        return `${name} играет «${CARD_DEFS.attack.name}»!`;
      case 'skip':
        return `${name} играет «${CARD_DEFS.skip.name}».`;
      case 'favor':
        return `${name} играет «${CARD_DEFS.favor.name}» на ${targetName}.`;
      case 'shuffle':
        return `${name} играет «${CARD_DEFS.shuffle.name}».`;
      case 'see-the-future':
        return `${name}: бухгалтерия интересуется колодой…`;
      case 'combo2':
        return `${name} играет пару «${CARD_DEFS[cards[0].type].name}» — крадёт карту у ${targetName}.`;
      case 'combo3':
        return `${name} играет три «${CARD_DEFS[cards[0].type].name}» против ${targetName}.`;
      case 'combo5':
        return `${name} играет 5 разных карт — забирает карту из сброса.`;
    }
  }
}
