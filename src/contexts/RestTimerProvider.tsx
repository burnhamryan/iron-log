import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { RestTimerContext, type RestTimerValue } from './restTimerContext';
import {
  readStoredTimer,
  writeStoredTimer,
  clearStoredTimer,
  secondsLeft,
  type StoredTimer,
} from '../lib/restTimer';

export function RestTimerProvider({ children }: { children: ReactNode }) {
  const [timer, setTimer] = useState<StoredTimer | null>(() => readStoredTimer());
  const [remaining, setRemaining] = useState(() => {
    const stored = readStoredTimer();
    return stored ? secondsLeft(stored) : 0;
  });

  const stopRest = useCallback(() => {
    setTimer(null);
    setRemaining(0);
    clearStoredTimer();
  }, []);

  const startRest = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    const next: StoredTimer = { endsAt: Date.now() + seconds * 1000, duration: seconds };
    setTimer(next);
    setRemaining(seconds);
    writeStoredTimer(next);
  }, []);

  useEffect(() => {
    if (!timer) return;

    // Derived from the clock rather than counted down, so a throttled or
    // suspended tab catches up the moment it runs again.
    const sync = () => {
      const left = secondsLeft(timer);
      if (left <= 0) {
        stopRest();
        return;
      }
      setRemaining(left);
    };

    const intervalId = setInterval(sync, 1000);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
    };
  }, [timer, stopRest]);

  const value = useMemo<RestTimerValue>(
    () => ({
      remainingSeconds: remaining,
      durationSeconds: timer?.duration ?? 0,
      isRunning: timer !== null,
      startRest,
      stopRest,
    }),
    [remaining, timer, startRest, stopRest]
  );

  return <RestTimerContext.Provider value={value}>{children}</RestTimerContext.Provider>;
}
