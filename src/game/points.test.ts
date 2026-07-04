import { describe, expect, it } from 'vitest';
import { pointsForWin } from './points';

describe('экономика очков (раздел 7 ТЗ)', () => {
  it('база: (100 + боты×20) × множитель + серия×15', () => {
    expect(pointsForWin('easy', 1, 0)).toBe(120); // (100+20)×1.0
    expect(pointsForWin('easy', 4, 0)).toBe(180); // (100+80)×1.0
    expect(pointsForWin('medium', 2, 0)).toBe(210); // (100+40)×1.5
    expect(pointsForWin('hard', 4, 0)).toBe(450); // (100+80)×2.5
  });

  it('бонус серии: +15 за победу в серии, кап на 10', () => {
    expect(pointsForWin('easy', 1, 1)).toBe(135);
    expect(pointsForWin('easy', 1, 10)).toBe(270); // кап
    expect(pointsForWin('easy', 1, 25)).toBe(270); // не больше капа
    expect(pointsForWin('hard', 4, 10)).toBe(600); // 450 + 150
  });
});
