import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import styles from './components.module.css';

/** Модальный лист снизу (iOS-стиль) */
export function Sheet({
  open,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className={styles.sheet}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            <h2 className={styles.sheetTitle}>{title}</h2>
            {subtitle && <p className={styles.sheetSub}>{subtitle}</p>}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
