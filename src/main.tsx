import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initTelegram } from './telegram/webapp';
import { useGame } from './store/game';
import './styles/global.css';

initTelegram();

// только в dev: доступ к стору из консоли для отладки
if (import.meta.env.DEV) {
  (window as unknown as { __game: typeof useGame }).__game = useGame;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
