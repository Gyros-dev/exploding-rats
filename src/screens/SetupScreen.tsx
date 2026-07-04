import { useGame } from '../store/game';
import { useSettings } from '../store/settings';
import type { Difficulty } from '../game/types';
import { BackBar } from '../ui/BackBar';
import { IconFlame } from '../ui/icons';
import s from '../ui/screens.module.css';

const DIFF_LABELS: Record<Difficulty, string> = {
  easy: 'Лёгкий',
  medium: 'Средний',
  hard: 'Сложный',
};

export function SetupScreen() {
  const settings = useSettings();
  const startGame = useGame((g) => g.startGame);

  return (
    <div className={s.screen}>
      <BackBar />
      <h1 className={s.sectionTitle}>Новая партия</h1>

      <div className="glass">
        <div className={s.settingRow}>
          <div>
            <div className={s.settingLabel}>Боты</div>
            <div className={s.settingHint}>Всего игроков: {settings.botCount + 1}</div>
          </div>
          <div className={s.segment}>
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                className={`${s.segmentBtn} ${settings.botCount === n ? s.segmentActive : ''} tnum`}
                onClick={() => settings.setBotCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className={`${s.settingRow} ${s.settingRowStack}`}>
          <div className={s.settingLabel}>Сложность</div>
          <div className={s.segment}>
            {(Object.keys(DIFF_LABELS) as Difficulty[]).map((d) => (
              <button
                key={d}
                className={`${s.segmentBtn} ${settings.difficulty === d ? s.segmentActive : ''}`}
                onClick={() => settings.setDifficulty(d)}
              >
                {DIFF_LABELS[d]}
              </button>
            ))}
          </div>
        </div>

        <div className={s.settingRow}>
          <div className={s.settingLabel}>Звук</div>
          <button
            className={`${s.toggle} ${settings.sound ? s.toggleOn : ''}`}
            onClick={() => settings.setSound(!settings.sound)}
            aria-label="Звук"
          />
        </div>

        <div className={s.settingRow}>
          <div className={s.settingLabel}>Вибрация</div>
          <button
            className={`${s.toggle} ${settings.haptics ? s.toggleOn : ''}`}
            onClick={() => settings.setHaptics(!settings.haptics)}
            aria-label="Вибрация"
          />
        </div>
      </div>

      <button className="btn" onClick={() => startGame(settings.botCount, settings.difficulty)}>
        <IconFlame /> В бой!
      </button>
    </div>
  );
}
