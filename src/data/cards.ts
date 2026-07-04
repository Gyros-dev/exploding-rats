/**
 * Манифест карт — единственный источник правды о составе колоды.
 * Состав соответствует физическому набору «Крысиная возня» (111 PDF):
 * 8 «Смертельный кринж» + 10 «Крыса, живи!» + 10×6 действий +
 * 8 видов крысокарт по 4 = 110 карт (+ рубашка).
 *
 * У КАЖДОЙ карты свой арт: файлы public/assets/cards/<imageStem>-<variant>.webp
 * (variant = 1..count). Рядом можно положить .png с тем же именем — он
 * подхватится как fallback; нет файла вовсе — рендерится CSS-плейсхолдер.
 */

export type CardType =
  | 'exploding-rat'
  | 'defuse'
  | 'attack'
  | 'skip'
  | 'favor'
  | 'shuffle'
  | 'see-the-future'
  | 'nope'
  | 'rat-1'
  | 'rat-2'
  | 'rat-3'
  | 'rat-4'
  | 'rat-5'
  | 'rat-6'
  | 'rat-7'
  | 'rat-8';

export interface CardDef {
  type: CardType;
  /** Название с физической карты */
  name: string;
  /** Сколько таких карт в полной колоде из 110 */
  count: number;
  /** Текст правил для этой карты (показывается в UI) */
  description: string;
  /** Базовое имя файлов арта: <imageStem>-<variant>.webp в public/assets/cards/ */
  imageStem: string;
  /** Крысокарта: сама по себе бесполезна, только для комбинаций */
  isRatCard: boolean;
  /** Можно ли отменить «Пидора ответом» (взрыв и обезвреживание — нельзя) */
  nopeable: boolean;
  /** Эмодзи для плейсхолдера */
  icon: string;
  /** Градиент плейсхолдера [от, до] */
  gradient: [string, string];
}

const ratCard = (
  n: number,
  name: string,
  icon: string,
  gradient: [string, string],
): CardDef => ({
  type: `rat-${n}` as CardType,
  name,
  count: 4,
  description:
    'Сама по себе бесполезна. Играй 2 одинаковые — укради случайную карту, 3 — потребуй конкретную.',
  imageStem: `rat-${n}`,
  isRatCard: true,
  nopeable: true,
  icon,
  gradient,
});

export const CARD_DEFS: Record<CardType, CardDef> = {
  'exploding-rat': {
    type: 'exploding-rat',
    name: 'Смертельный кринж',
    count: 8,
    description:
      'Если вытянул его и нет «Крыса, живи!» — ты кринжуешь насмерть и выбываешь. Твои карты вместе с кринжем уходят в сброс.',
    imageStem: 'exploding-rat',
    isRatCard: false,
    nopeable: false,
    icon: '💀',
    gradient: ['#2b2b30', '#0d0d0f'],
  },
  defuse: {
    type: 'defuse',
    name: 'Крыса, живи!',
    count: 10,
    description:
      'Обезвреживание от смертельного кринжа. Втайне верни кринж в колоду в любое место. После этого ход завершается.',
    imageStem: 'defuse',
    isRatCard: false,
    nopeable: false,
    icon: '🌿',
    gradient: ['#30D158', '#0B6E2E'],
  },
  attack: {
    type: 'attack',
    name: 'Гоп-стоп',
    count: 10,
    description:
      'Атака. Заверши ход, НЕ беря карту. Следующий игрок делает 2 хода. Если он тоже играет «Гоп-стоп» — его ходы обнуляются, а следующему достаётся (его остаток + 2).',
    imageStem: 'attack',
    isRatCard: false,
    nopeable: true,
    icon: '👊',
    gradient: ['#FF9F0A', '#8A5200'],
  },
  skip: {
    type: 'skip',
    name: 'Чилл',
    count: 10,
    description:
      'Пропусти один ход. Заверши ход, НЕ беря карту. Под «Гоп-стопом» гасит только один из требуемых ходов.',
    imageStem: 'skip',
    isRatCard: false,
    nopeable: true,
    icon: '😪',
    gradient: ['#0A84FF', '#0A3E80'],
  },
  favor: {
    type: 'favor',
    name: 'Разрешите доебаца',
    count: 10,
    description: 'Гони одну (1) карту: выбранный игрок отдаёт тебе карту по своему выбору.',
    imageStem: 'favor',
    isRatCard: false,
    nopeable: true,
    icon: '🖤',
    gradient: ['#3a3a3c', '#141414'],
  },
  shuffle: {
    type: 'shuffle',
    name: 'Крысиная суета',
    count: 10,
    description: 'Перемешай колоду.',
    imageStem: 'shuffle',
    isRatCard: false,
    nopeable: true,
    icon: '🌀',
    gradient: ['#AC8E68', '#5C4326'],
  },
  'see-the-future': {
    type: 'see-the-future',
    name: 'Бухгалтерия интересуется',
    count: 10,
    description:
      'Глянь 3 (три) верхние карты из колоды втайне от всех и верни в том же порядке.',
    imageStem: 'see-the-future',
    isRatCard: false,
    nopeable: true,
    icon: '🧮',
    gradient: ['#FF2D95', '#7A0F4A'],
  },
  nope: {
    type: 'nope',
    name: 'Пидора ответ',
    count: 10,
    description:
      'Нет. Отменяет действие любой карты (кроме Смертельного кринжа и «Крыса, живи!»). Играется в любой момент, даже не в свой ход. «Пидора ответ» на «Пидора ответ» — действие снова работает.',
    imageStem: 'nope',
    isRatCard: false,
    nopeable: true,
    icon: '🔥',
    gradient: ['#E63329', '#7A0F08'],
  },
  'rat-1': ratCard(1, 'Крыса-мизантроп', '😒', ['#8E8E93', '#3A3A3C']),
  'rat-2': ratCard(2, 'Душная крыса', '🥱', ['#64D2FF', '#1B5E7A']),
  'rat-3': ratCard(3, 'Татарская крыса', '🥟', ['#34C759', '#14532D']),
  'rat-4': ratCard(4, 'Крыса-панк', '🤘', ['#BF5AF2', '#5E1D80']),
  'rat-5': ratCard(5, 'Крыса-сердцеед', '💘', ['#FF6482', '#7A1F33']),
  'rat-6': ratCard(6, 'Крыса-вампир', '🧛', ['#5E5CE6', '#2A2985']),
  'rat-7': ratCard(7, 'Кавказская крыса', '🍖', ['#D97706', '#78350F']),
  'rat-8': ratCard(8, 'Высокоранговая крыса', '👑', ['#FFD60A', '#8F6E00']),
};

export const ALL_CARD_TYPES = Object.keys(CARD_DEFS) as CardType[];

export const RAT_CARD_TYPES: CardType[] = ALL_CARD_TYPES.filter(
  (t) => CARD_DEFS[t].isRatCard,
);

/** Рубашка карты */
export const CARD_BACK_STEM = 'card-back';

/** Суммарный размер колоды — проверяется тестом (должно быть 110) */
export const TOTAL_CARDS = ALL_CARD_TYPES.reduce(
  (sum, t) => sum + CARD_DEFS[t].count,
  0,
);
