"use client";

// Тосты: короткое сопереживающее сообщение об ошибке действия. Область
// с role="status" читается скринридером, поэтому удачные и неудачные
// сохранения/лайки/подписки не молчат.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastItem = { id: number; text: string; leaving?: boolean };

type ToastContextValue = {
  show: (text: string) => void;
};

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

const SHOW_MS = 4500;
const EXIT_MS = 160;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const retire = useCallback((id: number) => {
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), EXIT_MS);
  }, []);

  const show = useCallback(
    (text: string) => {
      const id = ++seq.current;
      // одинаковые подряд сообщения не плодим: достаточно одного
      setItems((prev) => [...prev.filter((t) => t.text !== text), { id, text }]);
      setTimeout(() => retire(id), SHOW_MS - EXIT_MS);
    },
    [retire],
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2 px-4"
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => retire(item.id)}
            aria-label="Закрыть сообщение"
            className={`pointer-events-auto max-w-md rounded-full bg-foreground px-4 py-2.5 text-center text-sm font-medium text-background shadow-overlay ${
              item.leaving ? "animate-sink" : "animate-rise"
            }`}
          >
            {item.text}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}
