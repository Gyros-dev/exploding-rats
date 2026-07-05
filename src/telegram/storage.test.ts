// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Эмулятор Telegram CloudStorage, повторяющий его реальные ограничения:
 *  - ключ обязан быть 1..128 символов из [A-Za-z0-9_-] (иначе ошибка);
 *  - значение не длиннее 4096 символов.
 * Именно из-за первого ограничения ключи с «:»/«.» молча не сохранялись —
 * этот мок падает так же, как настоящий клиент.
 */
const KEY_RE = /^[A-Za-z0-9_-]{1,128}$/;

function makeCloud() {
  const store = new Map<string, string>();
  return {
    store,
    setItem(key: string, value: string, cb?: (err: string | null, ok?: boolean) => void) {
      if (!KEY_RE.test(key)) return cb?.('WEBAPP_DATA_INVALID');
      if (value.length > 4096) return cb?.('VALUE_TOO_LONG');
      store.set(key, value);
      cb?.(null, true);
    },
    getItem(key: string, cb: (err: string | null, value?: string) => void) {
      if (!KEY_RE.test(key)) return cb('WEBAPP_DATA_INVALID');
      cb(null, store.get(key) ?? '');
    },
    removeItem(key: string, cb?: (err: string | null, ok?: boolean) => void) {
      if (!KEY_RE.test(key)) return cb?.('WEBAPP_DATA_INVALID');
      store.delete(key);
      cb?.(null, true);
    },
    getItems() {},
    removeItems() {},
    getKeys() {},
  };
}

type CloudMock = ReturnType<typeof makeCloud>;

/** Загрузить свежий модуль storage с заданным (или отсутствующим) облаком */
async function loadStorage(cloud: CloudMock | null) {
  vi.resetModules();
  vi.doMock('./webapp', () => ({
    tg: cloud ? { CloudStorage: cloud, isVersionAtLeast: () => true } : null,
  }));
  return import('./storage');
}

const SAVE_KEY = 'exploding-rats:save'; // содержит «:» — как в реальном сторе

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.doUnmock('./webapp');
});

describe('Telegram CloudStorage', () => {
  it('санитизирует ключи: запись реально попадает в облако (регрессия «:»/«.»)', async () => {
    const cloud = makeCloud();
    const s = await loadStorage(cloud);
    expect(s.isCloudStorage).toBe(true);

    await s.storageSet(SAVE_KEY, 'value-A');

    // облако НЕ пустое — значит cloudKey сработал; ключ санитизирован
    expect(cloud.store.size).toBeGreaterThan(0);
    expect([...cloud.store.keys()]).toContain('exploding-rats_save');
    // все ключи в облаке валидны по правилам Telegram
    for (const k of cloud.store.keys()) expect(k).toMatch(KEY_RE);
    expect(await s.storageGet(SAVE_KEY)).toBe('value-A');
  });

  it('кросс-девайс: запись на «устройстве A» читается на «устройстве B» без локальной копии', async () => {
    const cloud = makeCloud(); // общий аккаунт Telegram = общее облако

    // Устройство A: сохраняем партию
    const a = await loadStorage(cloud);
    await a.storageSet(SAVE_KEY, JSON.stringify({ turn: 3, deck: 29 }));

    // Устройство B: то же облако, но локальное хранилище пустое
    localStorage.clear();
    const b = await loadStorage(cloud);
    expect(await b.storageGet(SAVE_KEY)).toBe(JSON.stringify({ turn: 3, deck: 29 }));
  });

  it('чанкует значения длиннее лимита и собирает их обратно', async () => {
    const cloud = makeCloud();
    const s = await loadStorage(cloud);
    const big = 'x'.repeat(9000); // > 4096, уйдёт в несколько чанков

    await s.storageSet(SAVE_KEY, big);

    // ни один чанк не превышает лимит и все ключи валидны
    for (const [k, v] of cloud.store) {
      expect(k).toMatch(KEY_RE);
      expect(v.length).toBeLessThanOrEqual(4096);
    }
    expect(await s.storageGet(SAVE_KEY)).toBe(big);

    // читаем как «второе устройство» (пустой local) — большое значение целое
    localStorage.clear();
    const s2 = await loadStorage(cloud);
    expect(await s2.storageGet(SAVE_KEY)).toBe(big);
  });

  it('удаление вычищает и голову, и чанки', async () => {
    const cloud = makeCloud();
    const s = await loadStorage(cloud);
    await s.storageSet(SAVE_KEY, 'y'.repeat(9000));
    await s.storageRemove(SAVE_KEY);
    expect(cloud.store.size).toBe(0);
    expect(await s.storageGet(SAVE_KEY)).toBeNull();
  });
});

describe('localStorage fallback (вне Telegram)', () => {
  it('round-trip без облака', async () => {
    const s = await loadStorage(null);
    expect(s.isCloudStorage).toBe(false);
    await s.storageSet(SAVE_KEY, 'browser-save');
    expect(await s.storageGet(SAVE_KEY)).toBe('browser-save');
    await s.storageRemove(SAVE_KEY);
    expect(await s.storageGet(SAVE_KEY)).toBeNull();
  });

  it('чанкование работает и в localStorage', async () => {
    const s = await loadStorage(null);
    const big = 'z'.repeat(9000);
    await s.storageSet(SAVE_KEY, big);
    expect(await s.storageGet(SAVE_KEY)).toBe(big);
  });
});
