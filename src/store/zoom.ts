import { create } from 'zustand';
import type { CardType } from '../data/cards';

/**
 * Глобальный полноэкранный предпросмотр карты. Открывается из любого окна;
 * опционально несёт кнопку действия («Отдать эту карту», «Взять эту карту»).
 */
interface ZoomState {
  card: { type: CardType; variant?: number } | null;
  action: { label: string; run: () => void } | null;
  open(card: { type: CardType; variant?: number }, action?: { label: string; run: () => void }): void;
  close(): void;
}

export const useZoom = create<ZoomState>((set) => ({
  card: null,
  action: null,
  open: (card, action) => set({ card, action: action ?? null }),
  close: () => set({ card: null, action: null }),
}));
