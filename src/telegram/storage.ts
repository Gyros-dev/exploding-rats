import { tg } from './webapp';

/**
 * Кросс-девайсное хранилище: Telegram CloudStorage (синхронизируется между
 * телефоном и ПК внутри аккаунта Telegram, доступен с Bot API 6.9) с
 * fallback на localStorage (браузер / старые клиенты).
 *
 * CloudStorage ограничивает значение 4096 символами, поэтому большие
 * значения (сохранение партии) прозрачно режутся на чанки:
 *   <key>   = "__chunks:<n>"
 *   <key>.0 … <key>.(n-1) = куски строки
 */

const CHUNK = 3800;
const CHUNKS_MARK = '__chunks:';

const cloud =
  tg?.CloudStorage && (tg.isVersionAtLeast?.('6.9') ?? false)
    ? tg.CloudStorage
    : null;

// ---------- примитивы: один ключ ----------

function cloudGetRaw(key: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      cloud!.getItem(key, (err, value) =>
        resolve(err || value === undefined || value === '' ? null : value),
      );
    } catch {
      resolve(null);
    }
  });
}

function cloudSetRaw(key: string, value: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      cloud!.setItem(key, value, (err, ok) => resolve(!err && !!ok));
    } catch {
      resolve(false);
    }
  });
}

function cloudRemoveRaw(key: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      cloud!.removeItem(key, () => resolve());
    } catch {
      resolve();
    }
  });
}

function localGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function localSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* приватный режим */
  }
}

function localRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// ---------- публичное API (с чанкованием) ----------

export async function storageGet(key: string): Promise<string | null> {
  const head = cloud ? await cloudGetRaw(key) : localGet(key);
  if (head === null) {
    // облако пусто, но локальная копия могла остаться с прошлых версий
    return cloud ? localGet(key) : null;
  }
  if (!head.startsWith(CHUNKS_MARK)) return head;
  const n = Number(head.slice(CHUNKS_MARK.length));
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const part = cloud ? await cloudGetRaw(`${key}.${i}`) : localGet(`${key}.${i}`);
    if (part === null) return null; // повреждено
    parts.push(part);
  }
  return parts.join('');
}

export async function storageSet(key: string, value: string): Promise<void> {
  // всегда дублируем локально: мгновенное чтение + офлайн-страховка
  localSet(key, value.length > CHUNK ? CHUNKS_MARK + Math.ceil(value.length / CHUNK) : value);
  if (value.length > CHUNK) {
    for (let i = 0; i * CHUNK < value.length; i++) {
      const part = value.slice(i * CHUNK, (i + 1) * CHUNK);
      localSet(`${key}.${i}`, part);
      if (cloud) await cloudSetRaw(`${key}.${i}`, part);
    }
    if (cloud) await cloudSetRaw(key, CHUNKS_MARK + Math.ceil(value.length / CHUNK));
  } else {
    localSet(key, value);
    if (cloud) await cloudSetRaw(key, value);
  }
}

export async function storageRemove(key: string): Promise<void> {
  const head = cloud ? await cloudGetRaw(key) : localGet(key);
  if (head?.startsWith(CHUNKS_MARK)) {
    const n = Number(head.slice(CHUNKS_MARK.length));
    for (let i = 0; i < n; i++) {
      localRemove(`${key}.${i}`);
      if (cloud) await cloudRemoveRaw(`${key}.${i}`);
    }
  }
  localRemove(key);
  if (cloud) await cloudRemoveRaw(key);
}

export const isCloudStorage = cloud !== null;
