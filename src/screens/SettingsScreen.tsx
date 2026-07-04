import { ACCENT_PRESETS, useSettings, type ThemeOverride } from '../store/settings';
import { BackBar } from '../ui/BackBar';
import s from '../ui/screens.module.css';

const THEME_LABELS: Record<ThemeOverride, string> = {
  auto: 'Telegram',
  light: 'Светлая',
  dark: 'Тёмная',
};

export function SettingsScreen() {
  const settings = useSettings();

  return (
    <div className={s.screen}>
      <BackBar />
      <h1 className={s.sectionTitle}>Настройки</h1>
      <div className="glass">
        <div className={`${s.settingRow} ${s.settingRowStack}`}>
          <div>
            <div className={s.settingLabel}>Тема</div>
            <div className={s.settingHint}>«Telegram» следует теме приложения</div>
          </div>
          <div className={s.segment}>
            {(Object.keys(THEME_LABELS) as ThemeOverride[]).map((t) => (
              <button
                key={t}
                className={`${s.segmentBtn} ${settings.theme === t ? s.segmentActive : ''}`}
                onClick={() => settings.setTheme(t)}
              >
                {THEME_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
        <div className={`${s.settingRow} ${s.settingRowStack}`}>
          <div>
            <div className={s.settingLabel}>Цвет кнопок</div>
            <div className={s.settingHint}>Основной акцент интерфейса</div>
          </div>
          <div className={s.swatches}>
            {ACCENT_PRESETS.map((p) => (
              <button
                key={p.id}
                className={`${s.swatch} ${settings.accent === p.id ? s.swatchActive : ''}`}
                style={{ background: p.color }}
                aria-label={p.name}
                onClick={() => settings.setAccent(p.id)}
              />
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
    </div>
  );
}
