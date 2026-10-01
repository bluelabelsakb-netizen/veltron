import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const TITLES = { success: 'Tamamlandı', error: 'Hata', warning: 'Uyarı', info: 'Bilgi' };

let seq = 0;

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (type, title, message, ttl) => {
      const id = ++seq;
      const life = ttl ?? (type === 'error' ? 8000 : 4000);
      setItems((list) => [...list.slice(-4), { id, type, title, message }]);
      timers.current.set(id, setTimeout(() => dismiss(id), life));
      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      push,
      dismiss,
      success: (title, message) => push('success', title, message),
      error: (title, message) => push('error', title, message),
      warning: (title, message) => push('warning', title, message),
      info: (title, message) => push('info', title, message),
      /** Form gonderimi icin: hata nesnesini okunabilir mesajla gosterir. */
      fromError: (err, fallback = 'İşlem tamamlanamadı') =>
        push('error', fallback, err?.message || 'Beklenmeyen bir hata oluştu.'),
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((t) => {
          const Icon = ICONS[t.type] || Info;
          return (
            <div key={t.id} className={`toast ${t.type}`}>
              <Icon size={17} style={{ flexShrink: 0, marginTop: 1 }} />
              <div className="toast-body">
                <div className="toast-title">{t.title || TITLES[t.type]}</div>
                {t.message ? <div className="toast-msg">{t.message}</div> : null}
              </div>
              <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Kapat">
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast, ToastProvider icinde kullanilmalidir');
  return ctx;
}
