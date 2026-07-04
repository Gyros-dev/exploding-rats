import { useEffect } from 'react';
import { useGame, type Screen } from './store/game';
import { getInviteRoomCode, showBackButton } from './telegram/webapp';
import { GameScreen } from './screens/GameScreen';
import { LeaderboardScreen } from './screens/LeaderboardScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { MenuScreen } from './screens/MenuScreen';
import { MultiplayerScreen } from './screens/MultiplayerScreen';
import { ResultScreen } from './screens/ResultScreen';
import { RulesScreen } from './screens/RulesScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SetupScreen } from './screens/SetupScreen';
import { CardZoomOverlay } from './ui/CardZoomOverlay';

const SCREENS: Record<Screen, () => JSX.Element | null> = {
  menu: MenuScreen,
  setup: SetupScreen,
  game: GameScreen,
  rules: RulesScreen,
  leaderboard: LeaderboardScreen,
  result: ResultScreen,
  settings: SettingsScreen,
  mp: MultiplayerScreen,
  lobby: LobbyScreen,
};

export default function App() {
  const screen = useGame((g) => g.screen);
  const navigate = useGame((g) => g.navigate);
  const requestExit = useGame((g) => g.requestExit);
  const checkSave = useGame((g) => g.checkSave);

  // при старте проверяем сохранение и мягко открываем экран входа, если приложение
  // запущено по инвайт-ссылке ?room=XXXX
  useEffect(() => {
    void checkSave();
    if (getInviteRoomCode() && screen === 'menu') navigate('mp');
  }, [checkSave, navigate, screen]);

  // Telegram BackButton: из игры — диалог «сохранить и выйти?»,
  // с остальных экранов — назад в меню
  useEffect(() => {
    if (screen === 'menu') return;
    return showBackButton(() => {
      if (screen === 'game') requestExit();
      else if (screen === 'lobby') void useGame.getState().leaveRoom();
      else navigate('menu');
    });
  }, [screen, navigate, requestExit]);

  const Current = SCREENS[screen];
  return (
    <>
      <Current />
      <CardZoomOverlay />
    </>
  );
}
