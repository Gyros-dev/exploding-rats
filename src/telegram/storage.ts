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

/**
 * КРИТИЧНО: Telegram CloudStorage принимает ключи только из [A-Za-z0-9_-].
 * Наши ключи содержат «:» (exploding-rats:save) и «.» (чанки key.0) —
 * без санитизации ВСЕ облачные записи молча падали, данные жили только
 * в localStorage вебвью (который Telegram может очищать) и «терялись».
 * Локальные ключи не трогаем — старые сохранения продолжают читаться.
 */
function cloudKey(key: string): string {
  return key.replace(/[^A-Za-z0-9_-]/g, '_');
}

/**
 * КРИТИЧНО: некоторые клиенты Telegram не вызывают callback CloudStorage
 * (метод не поддержан / игнорируется) — без страховки промис висит вечно,
 * и любое `await storage*` замораживает UI (кнопка «Сохранить и выйти»
 * не срабатывала). Таймаут гарантирует, что промис всегда завершится;
 * локальная копия к этому моменту уже записана синхронно, данные целы.
 */
const CLOUD_TIMEOUT = 4000;

function cloudCall<T>(fallback: T, run: (settle: (v: T) => void) => void): Promise<T> {
  return new Promise((resolve) => {
    let done = false;
    const settle = (v: T) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => settle(fallback), CLOUD_TIMEOUT);
    try {
      run(settle);
    } catch {
      settle(fallback);
    }
  });
}

// ---------- примитивы: один ключ ----------

function cloudGetRaw(key: string): Promise<string | null> {
  return cloudCall<string | null>(null, (settle) =>
    cloud!.getItem(cloudKey(key), (err, value) =>
      settle(err || value === undefined || value === '' ? null : value),
    ),
  );
}

function cloudSetRaw(key: string, value: string): Promise<boolean> {
  return cloudCall(false, (settle) =>
    cloud!.setItem(cloudKey(key), value, (err, ok) => settle(!err && !!ok)),
  );
}

function cloudRemoveRaw(key: string): Promise<void> {
  return cloudCall<void>(undefined, (settle) =>
    cloud!.removeItem(cloudKey(key), () => settle(undefined)),
  );
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
