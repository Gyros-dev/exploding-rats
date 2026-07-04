import { AnimatePresence, motion } from 'framer-motion';
import { useZoom } from '../store/zoom';
import { CardFace } from './CardFace';
import s from './game.module.css';

/** Полноэкранный предпросмотр карты — монтируется один раз в App */
export function CardZoomOverlay() {
  const { card, action, close } = useZoom();
  return (
    <AnimatePresence>
      {card && (
        <motion.div
          className={s.previewOverlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            className={s.previewCard}
            initial={{ scale: 0.5, y: 120 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.6, y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
          >
            <CardFace
              type={card.type}
              variant={card.variant}
              width={Math.min(window.innerWidth * 0.72, 300)}
            />
          </motion.div>
          <div className={s.previewActions} onClick={(e) => e.stopPropagation()}>
            {action && (
              <button
                className="btn"
                onClick={() => {
                  close();
                  action.run();
                }}
              >
                {action.label}
              </button>
            )}
            <button className="btn btn--ghost" onClick={close}>
              Закрыть
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
