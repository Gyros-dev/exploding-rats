// Edge Function: verify-and-submit
//
// Принимает результат партии, валидирует подпись Telegram initData
// (HMAC-SHA256, секрет = HMAC_SHA256("WebAppData", BOT_TOKEN)),
// пересчитывает очки НА СЕРВЕРЕ и апсертит строку игрока.
// Клиентским числам не доверяем: клиент шлёт только факты партии.
//
// Секреты (supabase secrets set):
//   BOT_TOKEN — токен бота от @BotFather (НИКОГДА не класть в репозиторий)

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AUTH_MAX_AGE_SEC = 60 * 10; // initData не старше 10 минут
const MIN_SUBMIT_INTERVAL_SEC = 20; // антифрод: партия не может длиться меньше
const DIFFICULTY_MULT: Record<string, number> = { easy: 1.0, medium: 1.5, hard: 2.5 };

// ---------- Валидация initData по алгоритму Telegram ----------

async function hmacSha256(key: BufferSource, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

async function verifyInitData(
  initData: string,
  botToken: string,
): Promise<TgUser | null> {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  if (!receivedHash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secret = await hmacSha256(new TextEncoder().encode('WebAppData'), botToken);
  const computed = hex(await hmacSha256(secret, dataCheckString));
  if (computed !== receivedHash) return null;

  const authDate = Number(params.get('auth_date') ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > AUTH_MAX_AGE_SEC) return null;

  try {
    return JSON.parse(params.get('user') ?? '') as TgUser;
  } catch {
    return null;
  }
}

// ---------- Очки (единственный источник правды) ----------

function pointsForWin(difficulty: string, botCount: number, streak: number): number {
  const base = 100;
  const opponentsBonus = botCount * 20;
  const streakBonus = Math.min(streak, 10) * 15;
  return Math.round((base + opponentsBonus) * (DIFFICULTY_MULT[difficulty] ?? 1) + streakBonus);
}

// ---------- Handler ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  try {
    const { initData, won, difficulty, botCount } = await req.json();

    if (
      typeof initData !== 'string' ||
      typeof won !== 'boolean' ||
      !['easy', 'medium', 'hard'].includes(difficulty) ||
      ![1, 2, 3, 4].includes(botCount)
    ) {
      return json({ error: 'bad request' }, 400);
    }

    const botToken = Deno.env.get('BOT_TOKEN');
    if (!botToken) return json({ error: 'BOT_TOKEN is not configured' }, 500);

    const user = await verifyInitData(initData, botToken);
    if (!user) return json({ error: 'invalid initData' }, 401);

    // service role обходит RLS — единственная точка записи
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: existing } = await admin
      .from('leaderboard')
      .select('*')
      .eq('telegram_user_id', user.id)
      .maybeSingle();

    // Rate-limit: не чаще одного сабмита в MIN_SUBMIT_INTERVAL_SEC
    if (existing) {
      const last = new Date(existing.updated_at).getTime();
      if (Date.now() - last < MIN_SUBMIT_INTERVAL_SEC * 1000) {
        return json({ error: 'too many submissions, slow down' }, 429);
      }
    }

    const prev = existing ?? {
      score: 0,
      wins: 0,
      games_played: 0,
      current_streak: 0,
      best_streak: 0,
    };

    const points = won ? pointsForWin(difficulty, botCount, prev.current_streak) : 0;
    const next = {
      telegram_user_id: user.id,
      username: user.username ?? null,
      display_name: [user.first_name, user.last_name].filter(Boolean).join(' '),
      avatar_url: user.photo_url ?? null,
      score: prev.score + points,
      wins: prev.wins + (won ? 1 : 0),
      games_played: prev.games_played + 1,
      current_streak: won ? prev.current_streak + 1 : 0,
      best_streak: Math.max(prev.best_streak, won ? prev.current_streak + 1 : 0),
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await admin.from('leaderboard').upsert(next);
    if (upsertError) return json({ error: upsertError.message }, 500);

    const { count } = await admin
      .from('leaderboard')
      .select('*', { count: 'exact', head: true })
      .gt('score', next.score);

    return json({
      points,
      score: next.score,
      wins: next.wins,
      games_played: next.games_played,
      current_streak: next.current_streak,
      best_streak: next.best_streak,
      rank: (count ?? 0) + 1,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'internal error' }, 500);
  }
});
