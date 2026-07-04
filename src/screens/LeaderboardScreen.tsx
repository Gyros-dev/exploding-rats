import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchLeaderboard,
  type LeaderboardData,
} from '../supabase/leaderboard';
import { getUser } from '../telegram/webapp';
import { BackBar } from '../ui/BackBar';
import { IconRat, IconTrophy } from '../ui/icons';
import s from '../ui/screens.module.css';

export function LeaderboardScreen() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const me = getUser();

  const load = useCallback(async () => {
    setRefreshing(true);
    setData(await fetchLeaderboard());
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Pull-to-refresh
  const onTouchStart = (e: React.TouchEvent) => {
    if ((scrollRef.current?.scrollTop ?? 1) <= 0) startY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (startY.current !== null && e.changedTouches[0].clientY - startY.current > 70) {
      void load();
    }
    startY.current = null;
  };

  const myRow = data?.rows.find((r) => r.telegram_user_id === me.id);
  const myIndex = data?.rows.findIndex((r) => r.telegram_user_id === me.id) ?? -1;
  const inTop = myIndex >= 0;

  return (
    <div
      className={s.screen}
      ref={scrollRef}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <BackBar />
      <h1 className={s.sectionTitle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <IconTrophy size={24} /> Лидерборд
      </h1>

      {refreshing && <p style={{ textAlign: 'center', color: 'var(--text-dim)' }}>Обновляю…</p>}

      {data && !data.online && (
        <div className={s.offlineBadge}>
          Онлайн-таблица недоступна — показана локальная статистика
        </div>
      )}

      {data && data.rows.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
          Пока пусто. Выиграй первую партию!
        </p>
      )}

      {data?.rows.map((r, i) => {
        const isMe = r.telegram_user_id === me.id;
        return (
          <div key={r.telegram_user_id} className={`${s.lbRow} ${isMe ? s.lbMe : 'glass'}`}>
            <span className={`${s.lbRank} tnum`}>
              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
            </span>
            <div className={s.lbAvatar}>
              {r.avatar_url ? <img src={r.avatar_url} alt="" /> : <IconRat size={22} />}
            </div>
            <div className={s.lbName}>
              {r.display_name}
              <span>
                побед: {r.wins} · серия: {r.current_streak} (лучшая {r.best_streak})
              </span>
            </div>
            <span className={`${s.lbScore} tnum`}>{r.score.toLocaleString('ru-RU')}</span>
          </div>
        );
      })}

      {/* Свой ранг закреплён снизу, если игрок за пределами топа или далеко в списке */}
      {data && myRow && (data.myRank ?? 0) > 10 && (
        <div className={`${s.lbRow} ${s.lbMe} ${s.lbPinned}`}>
          <span className={`${s.lbRank} tnum`}>#{data.myRank ?? '—'}</span>
          <div className={s.lbAvatar}>
            {myRow.avatar_url ? <img src={myRow.avatar_url} alt="" /> : <IconRat size={22} />}
          </div>
          <div className={s.lbName}>
            {myRow.display_name}
            <span>это ты</span>
          </div>
          <span className={`${s.lbScore} tnum`}>{myRow.score.toLocaleString('ru-RU')}</span>
        </div>
      )}

      {data && !inTop && !myRow && data.myRank && (
        <div className={`${s.lbRow} ${s.lbMe} ${s.lbPinned}`}>
          <span className={`${s.lbRank} tnum`}>#{data.myRank}</span>
          <div className={s.lbName}>{me.first_name}<span>это ты</span></div>
        </div>
      )}
    </div>
  );
}
