import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Difficulty } from '../game/types';
import { setSoundEnabled } from '../audio/sfx';
import { applyTheme, setHapticsEnabled } from '../telegram/webapp';
import { storageGet, storageRemove, storageSet } from '../telegram/storage';

export type ThemeOverride = 'auto' | 'light' | 'dark';

/** Пресеты цвета кнопок */
export const ACCENT_PRESETS = [
  { id: 'fire', name: 'Огонь', color: '#FF6A1A' },
  { id: 'red', name: 'Крыса', color: '#E63329' },
  { id: 'blue', name: 'Синий', color: '#0A84FF' },
  { id: 'green', name: 'Зелёный', color: '#30D158' },
  { id: 'purple', name: 'Фиолетовый', color: '#BF5AF2' },
] as const;

export type AccentId = (typeof ACCENT_PRESETS)[number]['id'];

export function applyAccent(id: AccentId): void {
  const preset = ACCENT_PRESETS.find((p) => p.id === id) ?? ACCENT_PRESETS[0];
  document.documentElement.style.setProperty('--accent', preset.color);
}

interface SettingsState {
  botCount: number; // 1–4
  difficulty: Difficulty;
  sound: boolean;
  haptics: boolean;
  theme: ThemeOverride;
  accent: AccentId;
  setBotCount(n: number): void;
  setDifficulty(d: Difficulty): void;
  setSound(on: boolean): void;
  setHaptics(on: boolean): void;
  setTheme(t: ThemeOverride): void;
  setAccent(a: AccentId): void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      botCount: 2,
      difficulty: 'medium',
      sound: true,
      haptics: true,
      theme: 'auto',
      accent: 'fire',
      setBotCount: (botCount) => set({ botCount: Math.min(4, Math.max(1, botCount)) }),
      setDifficulty: (difficulty) => set({ difficulty }),
      setSound: (sound) => {
        setSoundEnabled(sound);
        set({ sound });
      },
      setHaptics: (haptics) => {
        setHapticsEnabled(haptics);
        set({ haptics });
      },
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      setAccent: (accent) => {
        applyAccent(accent);
        set({ accent });
      },
    }),
    {
      name: 'exploding-rats:settings',
      // Telegram CloudStorage → настройки одни и те же на телефоне и ПК
      storage: createJSONStorage(() => ({
        getItem: storageGet,
        setItem: storageSet,
        removeItem: storageRemove,
      })),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        setSoundEnabled(state.sound);
        setHapticsEnabled(state.haptics);
        applyTheme(state.theme);
        applyAccent(state.accent);
      },
    },
  ),
);
