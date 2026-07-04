import { motion } from 'framer-motion';
import { useGame } from '../store/game';
import { getUser } from '../telegram/webapp';
import { CardBack } from '../ui/CardFace';
import { IconBook, IconGear, IconPlay, IconSwords, IconTrophy, IconUsers } from '../ui/icons';
import s from '../ui/screens.module.css';

export function MenuScreen() {
  const navigate = useGame((g) => g.navigate);
  const hasSave = useGame((g) => g.hasSave);
  const resumeGame = useGame((g) => g.resumeGame);
  const user = getUser();

  return (
    <div className={s.screen}>
      <motion.div
        className={s.hero}
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 20 }}
      >
        <motion.div
          className={s.logoCard}
          initial={{ rotate: -8, scale: 0.8 }}
          animate={{ rotate: -4, scale: 1 }}
          transition={{ type: 'spring', damping: 12, stiffness: 180, delay: 0.1 }}
        >
          <CardBack width={132} />
        </motion.div>
        <h1 className={s.title}>Крысиная возня</h1>
        <p className={s.subtitle}>
          Привет, {user.first_name}! Не слови смертельный кринж — останься последней крысой.
        </p>
      </motion.div>

      <motion.div
        className={s.menuList}
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.06 } } }}
      >
        {hasSave && (
          <motion.button
            className="btn"
            variants={{ hidden: { y: 16, opacity: 0 }, show: { y: 0, opacity: 1 } }}
            onClick={() => void resumeGame()}
          >
            <IconSwords /> Продолжить бой
          </motion.button>
        )}
        {(
          [
            [IconPlay, 'Играть', 'setup'],
            [IconUsers, 'Мультиплеер', 'mp'],
            [IconBook, 'Правила', 'rules'],
            [IconTrophy, 'Лидерборд', 'leaderboard'],
            [IconGear, 'Настройки', 'settings'],
          ] as const
        ).map(([Icon, label, screen], i) => (
          <motion.button
            key={screen}
            className={i === 0 && !hasSave ? 'btn' : 'btn btn--ghost'}
            variants={{ hidden: { y: 16, opacity: 0 }, show: { y: 0, opacity: 1 } }}
            onClick={() => navigate(screen)}
          >
            <Icon /> {label}
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}
