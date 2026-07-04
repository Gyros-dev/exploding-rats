import { motion } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { ALL_CARD_TYPES, CARD_DEFS } from '../data/cards';
import { useZoom } from '../store/zoom';
import { BackBar } from '../ui/BackBar';
import { CardFace } from '../ui/CardFace';
import s from '../ui/screens.module.css';

function Accordion({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // без анимации высоты: она обрезала длинный контент при прокрутке
  return (
    <div className={`glass ${s.accordion}`}>
      <button className={s.accHeader} onClick={() => setOpen((v) => !v)}>
        {title}
        <motion.span animate={{ rotate: open ? 90 : 0 }}>›</motion.span>
      </button>
      {open && <div className={s.accBody}>{children}</div>}
    </div>
  );
}

export function RulesScreen() {
  const zoom = useZoom((z) => z.open);
  return (
    <div className={s.screen}>
      <BackBar />
      <h1 className={s.sectionTitle}>📖 Правила</h1>
      <p style={{ color: 'var(--text-dim)', margin: 0, fontSize: 'var(--fs-small)' }}>
        Видео-объяснение (на английском):{' '}
        <a href="https://explodingkittens.com/how" target="_blank" rel="noreferrer" style={{ color: 'var(--ios-blue)' }}>
          explodingkittens.com/how
        </a>
      </p>

      <Accordion title="🎬 Как выглядит партия">
        <p>
          В колоде прячется <b>Смертельный кринж</b>. Игроки по очереди берут
          карты, пока кто-нибудь его не вытянет. Тогда он <b>кринжует насмерть
          и выбывает</b> — если только у него нет карты «Крыса, живи!», которая
          позволяет втайне вернуть кринж в колоду… например, прямо на голову
          следующему игроку.
        </p>
        <p>
          Все остальные карты помогают оттянуть встречу с кринжем: подглядывать
          в колоду, чиллить, гоп-стопить соседей и красть чужие карты.
          Чем тоньше колода, тем выше риск. Побеждает <b>последний выживший</b>.
        </p>
      </Accordion>

      <Accordion title="🃏 Подготовка">
        <ul>
          <li>Из колоды убирают все <b>Смертельные кринжи (8)</b> и все <b>«Крыса, живи!» (10)</b>.</li>
          <li>Остаток тасуется, каждому раздают по <b>7 карт</b>.</li>
          <li>Каждый получает <b>1 «Крыса, живи!»</b> — на руке 8 карт.</li>
          <li>Добор урезается до классической плотности (полный набор рассчитан на большую компанию) — каждый раз в партии случайная часть колоды.</li>
          <li>Запасные «Крыса, живи!» замешиваются в колоду: <b>при 2–3 игроках</b> — только 2.</li>
          <li>В колоду замешивают кринжи: <b>на один меньше, чем игроков</b>. Лишние убираются.</li>
          <li>Колода тасуется и кладётся лицом вниз.</li>
        </ul>
      </Accordion>

      <Accordion title="🎯 Как ходить">
        <ul>
          <li>В свой ход можно разыграть <b>сколько угодно карт</b> (или ни одной), применяя их эффекты.</li>
          <li>В <b>конце хода обязательно</b> берёшь верхнюю карту колоды. Исключения — «Гоп-стоп» и «Чилл»: они завершают ход <b>без взятия</b>.</li>
          <li>Ход передаётся по часовой стрелке.</li>
          <li>Вытянул кринж без «Крыса, живи!» — выбываешь, твои карты и кринж уходят в сброс.</li>
          <li>Без карт на руке? Ходить нечем — просто берёшь карту.</li>
        </ul>
      </Accordion>

      <Accordion title="🗂 Все карты">
        {ALL_CARD_TYPES.map((t) => {
          const def = CARD_DEFS[t];
          return (
            <div key={t} className={s.ruleCard}>
              <CardFace type={t} width={52} onClick={() => zoom({ type: t })} />
              <div className={s.ruleCardInfo}>
                <b>{def.name}</b>
                <span>{def.description}</span>
              </div>
              <span className={`${s.ruleCardCount} tnum`}>×{def.count}</span>
            </div>
          );
        })}
      </Accordion>

      <Accordion title="✨ Особые комбинации">
        <p>Играются в свой ход. «Пидора ответ» может их отменить. Инструкции на самих картах при этом <b>игнорируются</b>.</p>
        <ul>
          <li><b>2 одинаковые карты</b> (любые с одинаковым названием) — укради <b>случайную</b> карту у выбранного оппонента.</li>
          <li><b>3 одинаковые</b> — назови карту; если она есть у оппонента, он отдаёт её. Нет — не повезло.</li>
          <li><b>5 разных</b> — возьми <b>любую</b> карту из стопки сброса.</li>
        </ul>
      </Accordion>

      <Accordion title="🏁 Конец игры">
        <p>
          Игра продолжается, пока не останется <b>один выживший</b> — он и победитель.
          Проигравшие утешаются тем, что кринж был смертельно смешным.
        </p>
      </Accordion>

      <Accordion title="❗ 3 важные вещи">
        <ul>
          <li>Карту «Крыса, живи!» <b>нельзя разыграть просто так</b> — только в ответ на вытянутый кринж.</li>
          <li>«Пидора ответ» работает <b>в любой момент</b>, даже не в твой ход, но не спасает от Смертельного кринжа и не отменяет «Крыса, живи!».</li>
          <li>Стакай «Гоп-стоп»: если ты под атакой и отвечаешь «Гоп-стопом», твои ходы обнуляются, а следующий получает их <b>плюс два</b>.</li>
        </ul>
      </Accordion>
    </div>
  );
}
