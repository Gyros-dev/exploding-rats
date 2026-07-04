/**
 * Звук. Если в public/assets/sfx/ лежит файл с оговорённым именем
 * (<name>.mp3 или <name>.wav) — играем его; иначе синтезируем звук
 * Web Audio API. Код менять не нужно — достаточно положить файлы.
 */

export type SfxName =
  | 'play' // карта легла на стол
  | 'draw' // взятие карты
  | 'explosion'
  | 'defuse'
  | 'win'
  | 'lose'
  | 'tap'
  | 'steal'
  | 'shuffle'
  | 'nope';

let enabled = true;
export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

let ctx: AudioContext | null = null;
function audioCtx(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

const base = import.meta.env.BASE_URL;
/** Кэш найденных файлов: null = файла нет, используем синтез */
const fileCache = new Map<SfxName, HTMLAudioElement | null>();

async function tryLoadFile(name: SfxName): Promise<HTMLAudioElement | null> {
  if (fileCache.has(name)) return fileCache.get(name)!;
  for (const ext of ['mp3', 'wav', 'ogg']) {
    const url = `${base}assets/sfx/${name}.${ext}`;
    try {
      const res = await fetch(url, { method: 'HEAD' });
      const type = res.headers.get('content-type') ?? '';
      if (res.ok && type.startsWith('audio')) {
        const el = new Audio(url);
        el.preload = 'auto';
        fileCache.set(name, el);
        return el;
      }
    } catch {
      /* сеть/404 — идём к синтезу */
    }
  }
  fileCache.set(name, null);
  return null;
}

export function playSfx(name: SfxName): void {
  if (!enabled) return;
  void tryLoadFile(name).then((el) => {
    if (el) {
      el.currentTime = 0;
      void el.play().catch(() => synth(name));
    } else {
      try {
        synth(name);
      } catch {
        /* без звука */
      }
    }
  });
}

// ---------- Синтез ----------

function tone(
  ac: AudioContext,
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType = 'sine',
  gainVal = 0.15,
): void {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + start);
  gain.gain.setValueAtTime(gainVal, ac.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + start + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + dur + 0.02);
}

function noise(ac: AudioContext, dur: number, filterFreq: number, gainVal = 0.3): void {
  const buffer = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(filterFreq, ac.currentTime);
  filter.frequency.exponentialRampToValueAtTime(80, ac.currentTime + dur);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(gainVal, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start();
}

function synth(name: SfxName): void {
  const ac = audioCtx();
  switch (name) {
    case 'tap':
      tone(ac, 1200, 0, 0.04, 'square', 0.06);
      break;
    case 'play':
      noise(ac, 0.08, 3000, 0.12);
      tone(ac, 500, 0.02, 0.06, 'triangle', 0.1);
      break;
    case 'draw':
      noise(ac, 0.12, 2200, 0.1);
      tone(ac, 700, 0.05, 0.08, 'sine', 0.08);
      break;
    case 'shuffle':
      for (let i = 0; i < 5; i++) noise(ac, 0.05, 2500 - i * 300, 0.07);
      break;
    case 'steal':
      tone(ac, 900, 0, 0.07, 'sawtooth', 0.08);
      tone(ac, 600, 0.08, 0.1, 'sawtooth', 0.08);
      break;
    case 'nope':
      tone(ac, 320, 0, 0.12, 'square', 0.12);
      tone(ac, 220, 0.1, 0.18, 'square', 0.12);
      break;
    case 'defuse':
      tone(ac, 500, 0, 0.08, 'sine', 0.1);
      tone(ac, 750, 0.09, 0.08, 'sine', 0.1);
      tone(ac, 1000, 0.18, 0.14, 'sine', 0.1);
      break;
    case 'explosion':
      noise(ac, 0.7, 900, 0.5);
      tone(ac, 60, 0, 0.5, 'sine', 0.4);
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => tone(ac, f, i * 0.13, 0.25, 'triangle', 0.14));
      break;
    case 'lose':
      [400, 340, 260, 180].forEach((f, i) => tone(ac, f, i * 0.16, 0.3, 'sawtooth', 0.1));
      break;
  }
}
