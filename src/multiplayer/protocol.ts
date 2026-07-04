import type { CardType } from '../data/cards';
import type { GameEvent, GameState } from '../game/types';

/**
 * Протокол мультиплеера (Supabase Realtime broadcast).
 *
 * Модель — хост-авторитарная: движок исполняется только у создателя комнаты.
 * Гости шлют 'action', хост валидирует через движок и рассылает 'snapshot'.
 * Presence-ключ участника: telegram id (в браузере — случайный id сессии).
 */

/** Участник комнаты (presence meta) */
export interface RoomMember {
  key: string;
  name: string;
  avatarUrl?: string;
}

/** Раскладка мест: seat = индекс игрока в engine.state.players */
export interface SeatMap {
  seats: { key: string; name: string; avatarUrl?: string }[];
}

/** Действие гостя → хосту */
export type MpAction =
  | { kind: 'play'; cardIds: number[]; target?: number; namedType?: CardType }
  | { kind: 'draw' }
  | { kind: 'nope' }
  | { kind: 'defuse'; position: number }
  | { kind: 'favor'; cardId: number }
  | { kind: 'pick'; cardId: number }
  | { kind: 'ack' };

export interface MpActionMsg {
  fromKey: string;
  action: MpAction;
}

/** Снапшот хоста → всем */
export interface MpSnapshotMsg {
  state: GameState;
  /** Дедлайн окна «Пидора ответа» (epoch ms) или null */
  nopeUntil: number | null;
  /** События последней мутации — для звука/анимаций у гостей */
  events?: GameEvent[];
}

/** Старт партии (и повтор для реконнекта) */
export interface MpStartMsg {
  seatMap: SeatMap;
  snapshot: MpSnapshotMsg;
}

export interface MpEndMsg {
  reason: 'host-left' | 'closed';
}

export const MP_EVENTS = {
  start: 'mp:start',
  action: 'mp:action',
  snapshot: 'mp:snapshot',
  end: 'mp:end',
  /** гость просит хоста повторить start (реконнект/поздний подписчик) */
  hello: 'mp:hello',
} as const;

/** Код комнаты: 4 буквы без похожих символов */
export function generateRoomCode(): string {
  const abc = 'ABCEHKMPTX'; // читаются одинаково в кириллице/латинице
  return Array.from(
    { length: 4 },
    () => abc[Math.floor(Math.random() * abc.length)],
  ).join('');
}

export function normalizeRoomCode(raw: string): string {
  // терпимость к кириллице: А→A, В→B и т.п.
  const map: Record<string, string> = {
    А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', К: 'K', М: 'M', Р: 'P', Т: 'T', Х: 'X',
  };
  return raw
    .toUpperCase()
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4);
}
