import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../supabase/client';
import { getUser, isInTelegram } from '../telegram/webapp';
import {
  MP_EVENTS,
  type MpActionMsg,
  type MpEndMsg,
  type MpSnapshotMsg,
  type MpStartMsg,
  type RoomMember,
} from './protocol';

/**
 * Обёртка над Supabase Realtime каналом комнаты:
 * presence (кто в лобби) + broadcast (start/action/snapshot/end).
 */

// Стабильный ключ участника: в Telegram — id пользователя,
// в браузере — случайный на вкладку (для локальных тестов двух окон)
let sessionKey: string | null = null;
export function myKey(): string {
  const u = getUser();
  if (isInTelegram && u.id !== 0) return String(u.id);
  if (!sessionKey) sessionKey = 'guest-' + Math.random().toString(36).slice(2, 10);
  return sessionKey;
}

export interface RoomHandlers {
  onMembers(members: RoomMember[]): void;
  onStart(msg: MpStartMsg): void;
  onAction(msg: MpActionMsg): void;
  onSnapshot(msg: MpSnapshotMsg): void;
  onEnd(msg: MpEndMsg): void;
  onHello(fromKey: string): void;
}

export class Room {
  private channel: RealtimeChannel;
  readonly code: string;

  private constructor(channel: RealtimeChannel, code: string) {
    this.channel = channel;
    this.code = code;
  }

  static async join(code: string, handlers: RoomHandlers): Promise<Room> {
    const sb = supabase();
    if (!sb) throw new Error('Мультиплеер требует настроенный Supabase');
    const me = getUser();
    const channel = sb.channel(`rats-room:${code}`, {
      config: { presence: { key: myKey() }, broadcast: { self: false } },
    });

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<{ name: string; avatarUrl?: string }>();
      const members: RoomMember[] = Object.entries(state).map(([key, metas]) => ({
        key,
        name: metas[0]?.name ?? 'Крыса',
        avatarUrl: metas[0]?.avatarUrl,
      }));
      handlers.onMembers(members);
    });
    channel.on('broadcast', { event: MP_EVENTS.start }, ({ payload }) =>
      handlers.onStart(payload as MpStartMsg),
    );
    channel.on('broadcast', { event: MP_EVENTS.action }, ({ payload }) =>
      handlers.onAction(payload as MpActionMsg),
    );
    channel.on('broadcast', { event: MP_EVENTS.snapshot }, ({ payload }) =>
      handlers.onSnapshot(payload as MpSnapshotMsg),
    );
    channel.on('broadcast', { event: MP_EVENTS.end }, ({ payload }) =>
      handlers.onEnd(payload as MpEndMsg),
    );
    channel.on('broadcast', { event: MP_EVENTS.hello }, ({ payload }) =>
      handlers.onHello((payload as { fromKey: string }).fromKey),
    );

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Не удалось подключиться к комнате')), 10000);
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer);
          await channel.track({
            name: me.first_name || 'Крыса',
            avatarUrl: me.photo_url,
          });
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timer);
          reject(new Error('Ошибка подключения к комнате'));
        }
      });
    });

    return new Room(channel, code);
  }

  send(
    event: (typeof MP_EVENTS)[keyof typeof MP_EVENTS],
    payload: MpStartMsg | MpActionMsg | MpSnapshotMsg | MpEndMsg | { fromKey: string },
  ): void {
    void this.channel.send({ type: 'broadcast', event, payload });
  }

  async leave(): Promise<void> {
    try {
      await this.channel.unsubscribe();
    } catch {
      /* уже закрыт */
    }
  }
}
