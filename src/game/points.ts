import type { Difficulty } from './types';

/**
 * Экономика очков. ВАЖНО: это «зеркало» формулы из Edge Function
 * (supabase/functions/verify-and-submit) — сервер считает очки сам и клиенту
 * не верит; клиентская копия нужна только для мгновенного отображения
 * и офлайн-fallback'а.
 */
export const DIFFICULTY_MULT: Record<Difficulty, number> = {
  easy: 1.0,
  medium: 1.5,
  hard: 2.5,
};

export function pointsForWin(
  difficulty: Difficulty,
  botCount: number,
  currentWinStreak: number,
): number {
  const base = 100;
  const opponentsBonus = botCount * 20; // 1 бот = +20 … 4 бота = +80
  const streakBonus = Math.min(currentWinStreak, 10) * 15; // до +150
  return Math.round((base + opponentsBonus) * DIFFICULTY_MULT[difficulty] + streakBonus);
}
