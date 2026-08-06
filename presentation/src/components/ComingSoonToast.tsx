import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
// toast msg
type ToastContextValue = {
  showComingSoon: (feature?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ComingSoonToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);

  const showComingSoon = useCallback((feature?: string) => {
    setMessage(
      feature ? `${feature} is coming soon` : "This feature is coming soon",
    );
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [message]);

  const value = useMemo(() => ({ showComingSoon }), [showComingSoon]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {message ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 animate-fade-up"
        >
          <div className="rounded-xl bg-ink px-4 py-3 text-sm font-medium text-white shadow-lg shadow-ink/25">
            {message}
          </div>
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useComingSoonToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useComingSoonToast must be used within ComingSoonToastProvider");
  }
  return context;
}
