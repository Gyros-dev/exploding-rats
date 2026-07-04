import type { CardType } from '../data/cards';

export interface Card {
  /** Уникальный id экземпляра карты в партии */
  id: number;
  type: CardType;
  /**
   * Номер арта (1..count типа): у каждой физической карты своя картинка
   * <imageStem>-<variant>.webp. Отсутствует — берётся 1.
   */
  variant?: number;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface PlayerState {
  /** Индекс игрока (0 — человек) */
  id: number;
  name: string;
  isBot: boolean;
  avatarUrl?: string;
  hand: Card[];
  alive: boolean;
  /** Порядок выбывания (для итогового экрана): 1 = выбыл первым */
  eliminatedOrder?: number;
}

/** Что именно разыграно (для окна «Неть» и резолва) */
export type PlayedActionKind =
  | 'attack'
  | 'skip'
  | 'favor'
  | 'shuffle'
  | 'see-the-future'
  | 'combo2'
  | 'combo3'
  | 'combo5';

export interface PendingAction {
  kind: PlayedActionKind;
  /** Кто сыграл */
  player: number;
  /** Сыгранные карты (уже перемещены в сброс) */
  cards: Card[];
  /** Цель для favor / combo2 / combo3 */
  target?: number;
  /** Названная карта для combo3 */
  namedType?: CardType;
  /**
   * Цепочка «Неть»: индексы игроков в порядке сыгранных «Неть».
   * Нечётная длина = действие отменено, чётная (в т.ч. 0) = работает.
   */
  nopeChain: number[];
}

/** Запрос ввода от конкретного игрока (человека или бота) */
export type InputRequest =
  | {
      /** Вытянута крыса, есть «Обезвредь» — выбрать позицию возврата */
      kind: 'defuse-position';
      player: number;
      ratCard: Card;
      deckSize: number;
    }
  | {
      /** «Подлижись»: target сам выбирает, какую карту отдать */
      kind: 'favor-give';
      /** Кто отдаёт */
      player: number;
      /** Кому */
      to: number;
    }
  | {
      /** Комбо из 5 разных: выбрать любую карту из сброса */
      kind: 'pick-discard';
      player: number;
    }
  | {
      /** «Подсмотри грядущее»: показать 3 карты, ждать подтверждения */
      kind: 'view-future';
      player: number;
      cards: Card[];
    };

/** События для анимаций/звука/лога — стор их выгребает после каждого вызова */
export type GameEvent =
  | { type: 'cards-played'; player: number; cards: Card[]; kind: PlayedActionKind }
  | { type: 'nope-played'; player: number; card: Card; chainLength: number }
  | { type: 'action-cancelled'; kind: PlayedActionKind; player: number }
  | { type: 'action-resolved'; kind: PlayedActionKind; player: number }
  | { type: 'card-drawn'; player: number; card: Card }
  | { type: 'rat-drawn'; player: number; card: Card }
  | { type: 'exploded'; player: number }
  | { type: 'defused'; player: number }
  | { type: 'rat-returned'; player: number }
  | { type: 'card-stolen'; from: number; to: number; card: Card; random: boolean }
  | { type: 'card-given'; from: number; to: number; card: Card }
  | { type: 'combo3-miss'; player: number; target: number; namedType: CardType }
  | { type: 'discard-taken'; player: number; card: Card }
  | { type: 'deck-shuffled'; player: number }
  | { type: 'future-seen'; player: number; cards: Card[] }
  | { type: 'turn-changed'; player: number; turns: number; underAttack: boolean }
  | { type: 'game-over'; winner: number };

export interface LogEntry {
  id: number;
  text: string;
  /** Индекс игрока, к которому относится запись (для подсветки) */
  player?: number;
}

export type GamePhase =
  | 'playing' // ход идёт: текущий игрок может играть карты или тянуть
  | 'nope-window' // сыграна карта/комбо, открыто окно для «Неть»
  | 'awaiting-input' // движок ждёт ввода (см. request)
  | 'game-over';

export interface GameState {
  players: PlayerState[];
  /** deck[0] — верх колоды */
  deck: Card[];
  /** последний элемент — верх сброса */
  discard: Card[];
  currentPlayer: number;
  /** Сколько ходов текущий игрок ещё должен сделать (включая текущий) */
  turnsRemaining: number;
  /** Текущий игрок ходит под «Нападай» (важно для стака) */
  underAttack: boolean;
  phase: GamePhase;
  pending: PendingAction | null;
  request: InputRequest | null;
  winner: number | null;
  log: LogEntry[];
  turnNumber: number;
}
