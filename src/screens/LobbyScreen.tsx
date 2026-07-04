import { useState } from 'react';
import { useGame } from '../store/game';
import { myKey } from '../multiplayer/room';
import { copyRoomCode, haptic } from '../telegram/webapp';
import { IconRat, IconSwords } from '../ui/icons';
import s from '../ui/screens.module.css';

/** Лобби комнаты: код, участники, старт (у хоста) */
export function LobbyScreen() {
  const roomCode = useGame((g) => g.roomCode);
  const lobbyMembers = useGame((g) => g.lobbyMembers);
  const mode = useGame((g) => g.mode);
  const startMpGame = useGame((g) => g.startMpGame);
  const leaveRoom = useGame((g) => g.leaveRoom);
  const mpError = useGame((g) => g.mpError);

  const [copyStatus, setCopyStatus] = useState('');
  const canStart = mode === 'host' && lobbyMembers.length >= 2 && lobbyMembers.length <= 5;
  const me = myKey();

  const flashStatus = (text: string) => {
    setCopyStatus(text);
    window.setTimeout(() => setCopyStatus(''), 2200);
  };

  const copyCode = async () => {
    if (!roomCode) return;
    haptic.light();
    const ok = await copyRoomCode(roomCode);
    if (ok) {
      haptic.success();
      flashStatus('Код скопирован');
    } else {
      haptic.error();
      flashStatus(`Код комнаты: ${roomCode}`);
    }
  };

  return (
    <div className={s.screen}>
      <h1 className={s.sectionTitle}>Комната</h1>

      <div className={`glass ${s.roomCode}`} onClick={copyCode} role="button">
        <span className="tnum">{roomCode}</span>
        <small>тапни, чтобы скопировать код комнаты</small>
      </div>

      {copyStatus && <div className={s.copyStatus}>{copyStatus}</div>}

      <div className="glass" style={{ padding: 8 }}>
        {lobbyMembers.map((m, i) => (
          <div key={m.key} className={s.lbRow}>
            <div className={s.lbAvatar}>
              {m.avatarUrl ? <img src={m.avatarUrl} alt="" /> : <IconRat size={22} />}
            </div>
            <div className={s.lbName}>
              {m.name}
              <span>
                {i === 0 || (mode === 'host' && m.key === me) ? '' : ''}
                {m.key === me ? 'это ты' : 'в лобби'}
              </span>
            </div>
          </div>
        ))}
        {lobbyMembers.length < 2 && (
          <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 'var(--fs-small)' }}>
            Ждём остальных… нужно от 2 до 5 игроков
          </p>
        )}
      </div>

      {mode === 'host' ? (
        <button className="btn" disabled={!canStart} onClick={startMpGame}>
          <IconSwords /> Начать бой ({lobbyMembers.length}/5)
        </button>
      ) : (
        <p style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
          Ждём, когда хост начнёт бой…
        </p>
      )}

      {mpError && <div className={s.offlineBadge}>{mpError}</div>}

      <button className="btn btn--ghost" onClick={() => void leaveRoom()}>
        Покинуть комнату
      </button>
    </div>
  );
}
