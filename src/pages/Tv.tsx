// Big-screen workout view for a TV (opened full-screen in Safari on the
// Mac mini and sent to the Apple TV over AirPlay as a separate display).
//
// Read-only: it follows whatever workout is in progress on the phone by
// polling the existing APIs, so nothing here writes to the database.

import { useCallback, useEffect, useRef, useState } from 'react';
import { userProgramsApi, programsApi, workoutLogsApi, exerciseHistoryApi } from '../lib/api';
import { useUserContext } from '../contexts/UserContext';
import { formatRir } from '../lib/rir';
import { lastWeightIn, formatLastSet, formatLastDate, workingSetsOf } from '../lib/lastPerformance';
import type {
  UserProgram,
  ProgramWithBlocks,
  WorkoutTemplateWithExercises,
  TemplateExerciseWithDetails,
  WorkoutLogWithExercises,
  LastExercisePerformance,
  SetLog,
} from '../types';

const POLL_MS = 4000;
const PROGRAM_REFRESH_MS = 5 * 60 * 1000;

type LoggedSet = SetLog & { created_at?: string };

function findTemplate(program: ProgramWithBlocks | null, templateId: string | null) {
  if (!program || !templateId) return null;
  for (const block of program.blocks || []) {
    for (const week of block.weeks || []) {
      const match = week.workouts?.find((w) => w.id === templateId);
      if (match) return match;
    }
  }
  return null;
}

function findWeekWorkouts(program: ProgramWithBlocks | null, weekId: string | null) {
  if (!program || !weekId) return [];
  for (const block of program.blocks || []) {
    const week = block.weeks?.find((w) => w.id === weekId);
    if (week) return week.workouts || [];
  }
  return [];
}

function loggedWorkingSets(log: WorkoutLogWithExercises | null, te: TemplateExerciseWithDetails): LoggedSet[] {
  const exerciseLog = log?.exercises?.find(
    (el) => el.template_exercise_id === te.id || el.exercise_id === te.exercise?.id
  );
  return ((exerciseLog?.sets || []) as LoggedSet[])
    .filter((s) => s.set_type === 'working')
    .sort((a, b) => a.set_number - b.set_number);
}

function formatRest(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function Tv() {
  const { weightUnit } = useUserContext();
  const now = useNow();

  const [program, setProgram] = useState<ProgramWithBlocks | null>(null);
  const [activeProgram, setActiveProgram] = useState<UserProgram | null>(null);
  const [log, setLog] = useState<WorkoutLogWithExercises | null>(null);
  const [template, setTemplate] = useState<WorkoutTemplateWithExercises | null>(null);
  const [history, setHistory] = useState<Map<string, LastExercisePerformance>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);

  const programRef = useRef<ProgramWithBlocks | null>(null);
  const historyForLog = useRef<string | null>(null);

  const loadProgram = useCallback(async () => {
    const programs = await userProgramsApi.list();
    const active = programs.data?.find((p) => p.is_active) || null;
    setActiveProgram(active);
    if (!active) {
      programRef.current = null;
      setProgram(null);
      return;
    }
    const details = await programsApi.get(active.program_id);
    if (details.data) {
      programRef.current = details.data;
      setProgram(details.data);
    }
  }, []);

  const poll = useCallback(async () => {
    const inProgress = await workoutLogsApi.list({ status: 'in_progress', limit: 1, include_empty: true });
    if (inProgress.error) {
      setOffline(true);
      return;
    }
    setOffline(false);

    const current = inProgress.data?.[0];
    if (!current) {
      setLog(null);
      setTemplate(null);
      return;
    }

    let tpl = findTemplate(programRef.current, current.workout_template_id ?? null);
    if (!tpl) {
      // Program may have changed since we loaded it
      await loadProgram();
      tpl = findTemplate(programRef.current, current.workout_template_id ?? null);
    }

    const full = await workoutLogsApi.get(current.id);
    if (full.data) setLog(full.data);
    setTemplate(tpl);

    if (tpl && historyForLog.current !== current.id) {
      historyForLog.current = current.id;
      const ids = Array.from(new Set((tpl.exercises || []).map((te) => te.exercise?.id).filter(Boolean) as string[]));
      if (ids.length) {
        const res = await exerciseHistoryApi.getLastPerformed(ids, current.id);
        const map = new Map<string, LastExercisePerformance>();
        for (const entry of res.data || []) map.set(entry.exercise_id, entry);
        setHistory(map);
      }
    }
  }, [loadProgram]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadProgram();
      await poll();
      if (!cancelled) setLoaded(true);
    })();
    const pollId = setInterval(poll, POLL_MS);
    const programId = setInterval(loadProgram, PROGRAM_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(pollId);
      clearInterval(programId);
    };
  }, [loadProgram, poll]);

  const clock = new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="fixed inset-0 bg-slate-950 text-slate-100 overflow-hidden select-none cursor-none">
      <div className="absolute top-6 right-10 text-3xl text-slate-500 tabular-nums">
        {offline && <span className="text-amber-500 mr-6 text-2xl">Reconnecting…</span>}
        {clock}
      </div>

      {!loaded ? (
        <Centered>
          <p className="text-4xl text-slate-500">Loading…</p>
        </Centered>
      ) : log && template ? (
        <ActiveWorkout log={log} template={template} history={history} weightUnit={weightUnit} now={now} />
      ) : (
        <Waiting workouts={findWeekWorkouts(program, activeProgram?.current_week_id ?? null)} hasProgram={!!activeProgram} />
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="h-full flex flex-col items-center justify-center text-center px-16">{children}</div>;
}

function Waiting({ workouts, hasProgram }: { workouts: WorkoutTemplateWithExercises[]; hasProgram: boolean }) {
  if (!hasProgram) {
    return (
      <Centered>
        <p className="text-5xl font-semibold">No active program</p>
      </Centered>
    );
  }
  return (
    <Centered>
      <p className="text-3xl text-slate-400 mb-4">Start a workout on your phone</p>
      <p className="text-6xl font-bold mb-14">This week</p>
      <div className="grid gap-5 w-full max-w-4xl">
        {workouts.map((w) => (
          <div key={w.id} className="flex items-baseline justify-between bg-slate-900 rounded-2xl px-10 py-6">
            <span className="text-4xl font-semibold">{w.name}</span>
            <span className="text-2xl text-slate-500">{w.exercises?.length || 0} exercises</span>
          </div>
        ))}
      </div>
    </Centered>
  );
}

interface ActiveProps {
  log: WorkoutLogWithExercises;
  template: WorkoutTemplateWithExercises;
  history: Map<string, LastExercisePerformance>;
  weightUnit: import('../lib/units').WeightUnit;
  now: number;
}

function ActiveWorkout({ log, template, history, weightUnit, now }: ActiveProps) {
  const exercises = [...(template.exercises || [])].sort((a, b) => a.exercise_order - b.exercise_order);
  const progress = exercises.map((te) => ({ te, sets: loggedWorkingSets(log, te) }));
  const currentIndex = progress.findIndex(({ te, sets }) => sets.length < te.working_sets);

  // Rest countdown from the most recently logged set across the session
  let restLeft = 0;
  let latest: { set: LoggedSet; te: TemplateExerciseWithDetails } | null = null;
  for (const { te, sets } of progress) {
    for (const set of sets) {
      if (set.created_at && (!latest || set.created_at > (latest.set.created_at || ''))) latest = { set, te };
    }
  }
  if (latest?.set.created_at) {
    const elapsed = Math.floor((now - new Date(latest.set.created_at).getTime()) / 1000);
    restLeft = Math.max(0, latest.te.rest_seconds - elapsed);
  }

  if (currentIndex === -1) {
    return (
      <Centered>
        <p className="text-[10rem] leading-none mb-6">✓</p>
        <p className="text-6xl font-bold">{template.name} done</p>
        <p className="text-3xl text-slate-400 mt-6">Finish the workout on your phone</p>
      </Centered>
    );
  }

  const { te: current, sets: doneSets } = progress[currentIndex];
  const last = workingSetsOf(history.get(current.exercise?.id || ''));
  const lastPerf = history.get(current.exercise?.id || '');
  const upNext = progress.slice(currentIndex + 1);
  const reps =
    current.rep_range_min === current.rep_range_max
      ? `${current.rep_range_min}`
      : `${current.rep_range_min}–${current.rep_range_max}`;

  return (
    <div className="h-full grid grid-cols-[2fr_1fr] gap-12 p-14 pt-20">
      <div className="flex flex-col min-h-0">
        <p className="text-2xl text-slate-400 uppercase tracking-widest">
          {template.name} · Exercise {currentIndex + 1} of {exercises.length}
        </p>
        <h1 className="text-7xl font-bold mt-4 leading-tight">{current.exercise?.name}</h1>

        <div className="flex gap-12 mt-10 text-4xl">
          <Stat label="Sets" value={`${current.working_sets} × ${reps}`} />
          {current.rir !== null && <Stat label="RIR" value={formatRir(current.rir, current.rir_max)} />}
          <Stat label="Rest" value={formatRest(current.rest_seconds)} />
        </div>

        <div className="flex gap-5 mt-12">
          {Array.from({ length: current.working_sets }, (_, i) => {
            const set = doneSets.find((s) => s.set_number === i + 1);
            const weight = set ? lastWeightIn(set, weightUnit) : null;
            return (
              <div
                key={i}
                className={`flex-1 rounded-2xl px-6 py-6 text-center ${
                  set ? 'bg-emerald-700/40 text-emerald-200' : i === doneSets.length ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                <p className="text-xl opacity-75">Set {i + 1}</p>
                <p className="text-4xl font-semibold mt-1 tabular-nums">
                  {set ? `${weight ?? 'BW'} × ${set.reps_completed ?? 0}` : i === doneSets.length ? 'Now' : '—'}
                </p>
              </div>
            );
          })}
        </div>

        {current.notes && (
          <p className="text-3xl text-slate-300 mt-12 leading-snug whitespace-pre-line">{current.notes}</p>
        )}

        {last.length > 0 && lastPerf && (
          <p className="text-2xl text-slate-500 mt-auto pt-8">
            Last time ({formatLastDate(lastPerf.workout_date)}): {last.map((s) => formatLastSet(s, weightUnit)).join(' · ')}{' '}
            {weightUnit}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-8 min-h-0">
        <div
          className={`rounded-3xl p-10 text-center transition-colors ${
            restLeft > 0 ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-slate-500'
          }`}
        >
          <p className="text-2xl uppercase tracking-widest">{restLeft > 0 ? 'Rest' : 'Go'}</p>
          <p className="text-8xl font-bold tabular-nums mt-2">{restLeft > 0 ? formatRest(restLeft) : '—'}</p>
        </div>

        <div className="min-h-0 overflow-hidden">
          <p className="text-2xl text-slate-500 uppercase tracking-widest mb-4">Up next</p>
          <div className="space-y-4">
            {upNext.length === 0 && <p className="text-3xl text-slate-400">Last exercise</p>}
            {upNext.slice(0, 5).map(({ te }) => (
              <div key={te.id} className="bg-slate-900 rounded-2xl px-6 py-4">
                <p className="text-3xl font-semibold truncate">{te.exercise?.name}</p>
                <p className="text-xl text-slate-500 mt-1">
                  {te.working_sets} × {te.rep_range_min === te.rep_range_max ? te.rep_range_min : `${te.rep_range_min}–${te.rep_range_max}`}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xl text-slate-500 uppercase tracking-widest">{label}</p>
      <p className="font-semibold tabular-nums mt-1">{value}</p>
    </div>
  );
}
