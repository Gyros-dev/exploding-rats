import { useState } from 'react';
import { isSupabaseConfigured } from '../config';
import { normalizeRoomCode } from '../multiplayer/protocol';
import { useGame } from '../store/game';
import { BackBar } from '../ui/BackBar';
import { IconUsers } from '../ui/icons';
import s from '../ui/screens.module.css';

/** Вход в мультиплеер: создать комнату или войти по коду */
export function MultiplayerScreen() {
  const createRoom = useGame((g) => g.createRoom);
  const joinRoom = useGame((g) => g.joinRoom);
  const mpBusy = useGame((g) => g.mpBusy);
  const mpError = useGame((g) => g.mpError);
  const [code, setCode] = useState('');

  if (!isSupabaseConfigured()) {
    return (
      <div className={s.screen}>
        <BackBar />
        <h1 className={s.sectionTitle}>Мультиплеер</h1>
        <p style={{ color: 'var(--text-dim)' }}>
          Для игры по сети нужен настроенный Supabase (см. README).
        </p>
      </div>
    );
  }

  return (
    <div className={s.screen}>
      <BackBar />
      <h1 className={s.sectionTitle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <IconUsers size={24} /> Мультиплеер
      </h1>
      <p style={{ color: 'var(--text-dim)', margin: 0, fontSize: 'var(--fs-small)' }}>
        2–5 игроков, включая дуэль 1 на 1. Создай комнату и скинь код друзьям.
      </p>

      <button className="btn" disabled={mpBusy} onClick={() => void createRoom()}>
        Создать комнату
      </button>

      <div className="glass" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className={s.settingLabel}>Войти по коду</div>
        <input
          className={s.codeInput}
          value={code}
          inputMode="text"
          autoCapitalize="characters"
          maxLength={4}
          placeholder="КОД"
          onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
        />
        <button
          className="btn"
          disabled={mpBusy || code.length !== 4}
          onClick={() => void joinRoom(code)}
        >
          Войти
        </button>
      </div>

      {mpBusy && <p style={{ textAlign: 'center', color: 'var(--text-dim)' }}>Подключаюсь…</p>}
      {mpError && <div className={s.offlineBadge}>{mpError}</div>}
    </div>
  );
}
