import { LEADERBOARD_SIZE, NETWORK_TIMEOUT_MS } from '../config';
import { supabase } from './client';
import { pointsForWin } from '../game/points';
import type { Difficulty } from '../game/types';
import { getInitData, getUser } from '../telegram/webapp';
import { storageGet, storageSet } from '../telegram/storage';

export interface LeaderboardRow {
  telegram_user_id: number;
  username: string | null;
  display_name: string;
  avatar_url: string | null;
  score: number;
  wins: number;
  games_played: number;
  current_streak: number;
  best_streak: number;
}

export interface SubmitResult {
  points: number;
  score: number;
  wins: number;
  games_played: number;
  current_streak: number;
  best_streak: number;
  rank: number | null;
  /** true = результат записан онлайн; false = локальный fallback */
  online: boolean;
}

export interface LeaderboardData {
  rows: LeaderboardRow[];
  myRank: number | null;
  online: boolean;
}

function withTimeout<T>(p: PromiseLike<T>): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error('timeout')), NETWORK_TIMEOUT_MS),
    ),
  ]);
}

// ---------- Офлайн-fallback (Telegram CloudStorage / localStorage) ----------

const LS_KEY = 'exploding-rats:local-stats';

interface LocalStats {
  score: number;
  wins: number;
  games_played: number;
  current_streak: number;
  best_streak: number;
}

async function readLocal(): Promise<LocalStats> {
  try {
    const raw = await storageGet(LS_KEY);
    if (raw) return JSON.parse(raw) as LocalStats;
  } catch {
    /* повреждено — начинаем заново */
  }
  return { score: 0, wins: 0, games_played: 0, current_streak: 0, best_streak: 0 };
}

function writeLocal(s: LocalStats): void {
  void storageSet(LS_KEY, JSON.stringify(s));
}

async function submitLocal(
  won: boolean,
  difficulty: Difficulty,
  botCount: number,
): Promise<SubmitResult> {
  const s = await readLocal();
  s.games_played += 1;
  let points = 0;
  if (won) {
    points = pointsForWin(difficulty, botCount, s.current_streak);
    s.wins += 1;
    s.current_streak += 1;
    s.best_streak = Math.max(s.best_streak, s.current_streak);
    s.score += points;
  } else {
    s.current_streak = 0;
  }
  writeLocal(s);
  return { points, ...s, rank: null, online: false };
}

// ---------- Публичное API ----------

/**
 * Отправить результат партии. Очки считает СЕРВЕР (Edge Function
 * verify-and-submit) после валидации initData; клиент шлёт только факты.
 * Оффлайн/без конфига — локальный fallback с той же формулой.
 */
export async function submitGameResult(
  won: boolean,
  difficulty: Difficulty,
  botCount: number,
): Promise<SubmitResult> {
  const sb = supabase();
  const initData = getInitData();
  if (!sb || !initData) return submitLocal(won, difficulty, botCount);
  try {
    const { data, error } = await withTimeout(
      sb.functions.invoke('verify-and-submit', {
        body: { initData, won, difficulty, botCount },
      }),
    );
    if (error) throw error;
    const d = data as Omit<SubmitResult, 'online'>;
    // Кэшируем и локально, чтобы fallback не «обнулялся» при пропаже сети
    writeLocal({
      score: d.score,
      wins: d.wins,
      games_played: d.games_played,
      current_streak: d.current_streak,
      best_streak: d.best_streak,
    });
    return { ...d, online: true };
  } catch (err) {
    console.warn('[leaderboard] сабмит ушёл в офлайн-fallback:', err);
    return submitLocal(won, difficulty, botCount);
  }
}

/** Топ-500 + ранг текущего игрока. Оффлайн — локальная строка игрока. */
export async function fetchLeaderboard(): Promise<LeaderboardData> {
  const sb = supabase();
  const me = getUser();
  if (sb) {
    try {
      const { data, error } = await withTimeout(
        sb
          .from('leaderboard')
          .select('*')
          .order('score', { ascending: false })
          .limit(LEADERBOARD_SIZE),
      );
      if (error) throw error;
      const rows = (data ?? []) as LeaderboardRow[];
      let myRank: number | null =
        rows.findIndex((r) => r.telegram_user_id === me.id) + 1 || null;
      if (myRank === null && me.id !== 0) {
        // Игрок за пределами топ-500 — узнаём точный ранг отдельным запросом
        const mine = await withTimeout(
          sb.from('leaderboard').select('score').eq('telegram_user_id', me.id).maybeSingle(),
        );
        if (mine.data) {
          const { count } = await withTimeout(
            sb
              .from('leaderboard')
              .select('*', { count: 'exact', head: true })
              .gt('score', (mine.data as { score: number }).score),
          );
          myRank = (count ?? 0) + 1;
        }
      }
      return { rows, myRank, online: true };
    } catch (err) {
      // не молчим: причина видна в консоли (схема/сеть), UI уходит в офлайн
      console.warn('[leaderboard] онлайн-режим недоступен:', err);
    }
  }
  const s = await readLocal();
  const rows: LeaderboardRow[] =
    s.games_played > 0
      ? [
          {
            telegram_user_id: me.id,
            username: null,
            display_name: me.first_name,
            avatar_url: me.photo_url ?? null,
            ...s,
          },
        ]
      : [];
  return { rows, myRank: rows.length ? 1 : null, online: false };
}

export function localStats(): Promise<LocalStats> {
  return readLocal();
}
