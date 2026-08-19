import { createContext, useContext } from 'react';

export interface RestTimerValue {
  /** Seconds left, or 0 when no rest is running */
  remainingSeconds: number;
  /** The rest length the running timer was started with */
  durationSeconds: number;
  isRunning: boolean;
  startRest: (seconds: number) => void;
  stopRest: () => void;
}

export const RestTimerContext = createContext<RestTimerValue | undefined>(undefined);

export function useRestTimer(): RestTimerValue {
  const context = useContext(RestTimerContext);
  if (context === undefined) {
    throw new Error('useRestTimer must be used within a RestTimerProvider');
  }
  return context;
}
