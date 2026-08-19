import { useRestTimer } from '../../contexts/restTimerContext';

/**
 * Rendered from the layout so rest keeps running - and stays visible - while
 * you move between screens.
 */
export function RestTimer() {
  const { remainingSeconds, durationSeconds, isRunning, stopRest } = useRestTimer();

  if (!isRunning) return null;

  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  const pct = durationSeconds > 0 ? (remainingSeconds / durationSeconds) * 100 : 0;

  return (
    <div className="fixed bottom-20 left-0 right-0 mx-4 md:mx-auto md:max-w-md z-40">
      <div className="bg-slate-800 dark:bg-slate-700 text-white rounded-xl p-4 shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Rest Timer</span>
          <button onClick={stopRest} className="text-xs text-slate-400 hover:text-white">Skip</button>
        </div>
        <div className="text-3xl font-bold text-center mb-2">{mins}:{secs.toString().padStart(2, '0')}</div>
        <div className="h-1.5 bg-slate-600 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full transition-all duration-1000" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
