// Persistence for the rest timer. The end time is stored as wall-clock so the
// countdown survives navigation, backgrounding and reloads.

export const REST_TIMER_STORAGE_KEY = 'iron-log-rest-timer';

export interface StoredTimer {
  endsAt: number;
  duration: number;
}

export function secondsLeft(timer: StoredTimer, now: number = Date.now()): number {
  return Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
}

export function readStoredTimer(now: number = Date.now()): StoredTimer | null {
  try {
    const raw = localStorage.getItem(REST_TIMER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredTimer>;
    if (typeof parsed?.endsAt !== 'number' || typeof parsed?.duration !== 'number') return null;
    // An expired rest is not resumed
    if (parsed.endsAt <= now) return null;
    return { endsAt: parsed.endsAt, duration: parsed.duration };
  } catch {
    return null;
  }
}

export function writeStoredTimer(timer: StoredTimer): void {
  try {
    localStorage.setItem(REST_TIMER_STORAGE_KEY, JSON.stringify(timer));
  } catch {
    // storage unavailable (private mode) - the in-memory timer still works
  }
}

export function clearStoredTimer(): void {
  try {
    localStorage.removeItem(REST_TIMER_STORAGE_KEY);
  } catch {
    // ignore
  }
}
