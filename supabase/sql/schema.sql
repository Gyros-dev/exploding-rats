-- Схема лидерборда «Взрывных крыс».
-- Выполнить в Supabase: SQL Editor → New query → вставить целиком → Run.

create table if not exists public.leaderboard (
  telegram_user_id  bigint primary key,
  username          text,
  display_name      text not null,
  avatar_url        text,
  score             bigint not null default 0,
  wins              int not null default 0,
  games_played      int not null default 0,
  current_streak    int not null default 0,
  best_streak       int not null default 0,
  updated_at        timestamptz not null default now()
);

create index if not exists leaderboard_score_idx
  on public.leaderboard (score desc);

-- ---------- RLS ----------
alter table public.leaderboard enable row level security;

-- Читать топ может кто угодно (anon) — нужно для отображения таблицы.
drop policy if exists "leaderboard is readable by everyone" on public.leaderboard;
create policy "leaderboard is readable by everyone"
  on public.leaderboard
  for select
  to anon, authenticated
  using (true);

-- INSERT/UPDATE/DELETE политики намеренно НЕ создаются:
-- при включённом RLS отсутствие политики = запрет. Запись идёт только
-- через Edge Function verify-and-submit с service role (обходит RLS).
