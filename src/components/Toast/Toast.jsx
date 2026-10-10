import { useEffect, useRef } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './Toast.css';

export default function Toast({ message, type = 'success', onClose, duration = 3500 }) {
  const timerRef = useRef(null);

  useEffect(() => {
    if (!message) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onClose?.();
    }, duration);
    return () => clearTimeout(timerRef.current);
  }, [message, duration, onClose]);

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          className={`hero-toast hero-toast--${type}`}
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          role="alert"
          aria-live="polite"
        >
          <span className="hero-toast__icon">
            {type === 'success' ? <CheckCircle size={15} /> : <XCircle size={15} />}
          </span>
          <span className="hero-toast__msg">{message}</span>
          <button className="hero-toast__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}