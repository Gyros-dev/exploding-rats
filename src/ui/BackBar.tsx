import { useGame } from '../store/game';
import { haptic, isInTelegram } from '../telegram/webapp';
import s from './screens.module.css';

/**
 * Экранная кнопка «Назад» — только вне Telegram: внутри клиента навигацию
 * делает системный BackButton, дублировать его не нужно.
 */
export function BackBar() {
  const navigate = useGame((g) => g.navigate);
  if (isInTelegram) return null;
  return (
    <button
      className={s.backBtn}
      onClick={() => {
        haptic.light();
        navigate('menu');
      }}
    >
      ‹ Назад
    </button>
  );
}
