-- ОДНОРАЗОВЫЙ ФИКС: существующая таблица leaderboard создана не по schema.sql
-- (нет колонок score / telegram_user_id / display_name / серий) — из-за этого
-- клиент не может прочитать топ и падает в офлайн-режим.
-- Таблица сейчас ПУСТАЯ (проверено), поэтому безопасно пересоздать её с нуля.
-- Выполнить целиком в Supabase SQL Editor. Повторно запускать НЕ нужно.

drop table if exists public.leaderboard;

create table public.leaderboard (
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

create index leaderboard_score_idx on public.leaderboard (score desc);

alter table public.leaderboard enable row level security;

create policy "leaderboard is readable by everyone"
  on public.leaderboard
  for select
  to anon, authenticated
  using (true);

-- INSERT/UPDATE политик нет намеренно: запись только через Edge Function
-- verify-and-submit (service role обходит RLS).
