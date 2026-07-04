/**
 * Обёртка над Telegram.WebApp. Работает и вне Telegram (локальная разработка):
 * все методы деградируют в no-op, пользователь подменяется моком.
 */

export interface TgUser {
  id: number;
  first_name: string;
  username?: string;
  photo_url?: string;
}

type CloudCb<T> = (err: string | null, value?: T) => void;

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: TgUser };
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  version?: string;
  isVersionAtLeast?(v: string): boolean;
  CloudStorage?: {
    setItem(key: string, value: string, cb?: CloudCb<boolean>): void;
    getItem(key: string, cb: CloudCb<string>): void;
    getItems(keys: string[], cb: CloudCb<Record<string, string>>): void;
    removeItem(key: string, cb?: CloudCb<boolean>): void;
    removeItems(keys: string[], cb?: CloudCb<boolean>): void;
    getKeys(cb: CloudCb<string[]>): void;
  };
  ready(): void;
  expand(): void;
  /** Bot API 7.7+: не сворачивать мини-апп вертикальным свайпом */
  disableVerticalSwipes?(): void;
  onEvent(event: string, cb: () => void): void;
  offEvent(event: string, cb: () => void): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  MainButton: {
    setText(t: string): void;
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
  switchInlineQuery?(query: string, chatTypes?: string[]): void;
  openTelegramLink?(url: string): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export const tg: TelegramWebApp | null = window.Telegram?.WebApp ?? null;
export const isInTelegram = tg !== null && tg.initData.length > 0;

const MOCK_USER: TgUser = { id: 0, first_name: 'Гость' };

export function getUser(): TgUser {
  return tg?.initDataUnsafe.user ?? MOCK_USER;
}

export function getInitData(): string {
  return tg?.initData ?? '';
}

// Текущий ручной override темы ('auto' = следовать Telegram)
let themeOverride: 'auto' | 'light' | 'dark' = 'auto';

export function initTelegram(): void {
  if (!tg) return;
  tg.ready();
  tg.expand();
  // иначе вертикальный скролл (правила, лидерборд) сворачивает мини-апп
  try {
    tg.disableVerticalSwipes?.();
  } catch {
    /* старый клиент */
  }
  applyTheme();
  // при смене темы в Telegram переприменяем с учётом ручного override
  tg.onEvent('themeChanged', () => applyTheme(themeOverride));
  // вне Telegram следим за системной темой
  window
    .matchMedia?.('(prefers-color-scheme: dark)')
    ?.addEventListener?.('change', () => applyTheme(themeOverride));
}

/**
 * Синхронизация темы: перекладываем themeParams в CSS-переменные.
 * override: принудительная тема из настроек ('auto' — следовать Telegram).
 */
export function applyTheme(override?: 'auto' | 'light' | 'dark'): void {
  if (override !== undefined) themeOverride = override;
  const root = document.documentElement;
  // в Telegram — тема клиента; вне Telegram скрипт-CDN отдаёт фиктивный
  // colorScheme='light', поэтому там доверяем системной теме
  const scheme =
    themeOverride === 'auto'
      ? isInTelegram
        ? (tg?.colorScheme ?? preferredScheme())
        : preferredScheme()
      : themeOverride;
  root.dataset.theme = scheme;
  const p = tg?.themeParams ?? {};
  const map: Record<string, string | undefined> = {
    '--tg-bg': p.bg_color,
    '--tg-text': p.text_color,
    '--tg-hint': p.hint_color,
    '--tg-link': p.link_color,
    '--tg-button': p.button_color,
    '--tg-button-text': p.button_text_color,
    '--tg-secondary-bg': p.secondary_bg_color,
  };
  for (const [k, v] of Object.entries(map)) {
    if (v && themeOverride === 'auto') root.style.setProperty(k, v);
    else root.style.removeProperty(k);
  }
}

function preferredScheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// ---------- Haptics (с тумблером из настроек) ----------

let hapticsEnabled = true;
export function setHapticsEnabled(on: boolean): void {
  hapticsEnabled = on;
}

export const haptic = {
  light: () => hapticsEnabled && tg?.HapticFeedback?.impactOccurred('light'),
  medium: () => hapticsEnabled && tg?.HapticFeedback?.impactOccurred('medium'),
  heavy: () => hapticsEnabled && tg?.HapticFeedback?.impactOccurred('heavy'),
  success: () => hapticsEnabled && tg?.HapticFeedback?.notificationOccurred('success'),
  error: () => hapticsEnabled && tg?.HapticFeedback?.notificationOccurred('error'),
  warning: () => hapticsEnabled && tg?.HapticFeedback?.notificationOccurred('warning'),
  selection: () => hapticsEnabled && tg?.HapticFeedback?.selectionChanged(),
};

// ---------- Кнопки ----------

export function showBackButton(onBack: () => void): () => void {
  if (!tg) return () => {};
  tg.BackButton.onClick(onBack);
  tg.BackButton.show();
  return () => {
    tg.BackButton.offClick(onBack);
    tg.BackButton.hide();
  };
}

export function showMainButton(text: string, onClick: () => void): () => void {
  if (!tg) return () => {};
  tg.MainButton.setText(text);
  tg.MainButton.onClick(onClick);
  tg.MainButton.show();
  return () => {
    tg.MainButton.offClick(onClick);
    tg.MainButton.hide();
  };
}

// ---------- Шэринг ----------

export function shareResult(points: number, rank: number | null): void {
  const text = `Я выжил во «Взрывных крысах» и заработал ${points} очков${rank ? ` (место #${rank})` : ''}! 🐀💥 Сможешь лучше?`;
  if (tg?.switchInlineQuery) {
    tg.switchInlineQuery(text, ['users', 'groups']);
  } else if (navigator.share) {
    navigator.share({ text }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(text).catch(() => {});
  }
}
