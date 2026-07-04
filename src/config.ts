/**
 * Конфигурация приложения.
 *
 * SUPABASE_URL и SUPABASE_ANON_KEY — публичные значения (anon-ключ безопасен
 * для клиента, доступ ограничен RLS). Токен бота сюда НЕ КЛАСТЬ НИКОГДА —
 * он живёт только в секретах Supabase Edge Functions.
 *
 * Если оставить плейсхолдеры пустыми, игра работает полностью офлайн,
 * а лидерборд переключается на локальный fallback (localStorage).
 */
export const SUPABASE_URL = 'https://bvqalkxmdroebgchqdcd.supabase.co'; // например: https://abcdefghij.supabase.co
export const SUPABASE_ANON_KEY = 'sb_publishable_NBmSHBp00R7BdAcvyvORPA_C6m6dcDs'; // anon public key из Project Settings → API

export const isSupabaseConfigured = (): boolean =>
  SUPABASE_URL.startsWith('https://') && SUPABASE_ANON_KEY.length > 20;

/** Таймаут сетевых запросов, мс */
export const NETWORK_TIMEOUT_MS = 8000;
/** Размер онлайн-таблицы лидеров */
export const LEADERBOARD_SIZE = 500;
