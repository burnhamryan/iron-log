import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { ProteinSummary } from '../../types';

const DAYS = 30;

function isoDate(value: string | Date): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

/** A continuous run of days, so unlogged days show as gaps rather than closing up. */
function buildSeries(summary: ProteinSummary) {
  const byDate = new Map(summary.days.map((day) => [isoDate(day.date), Number(day.total_grams)]));
  const series: { date: string; grams: number; logged: boolean }[] = [];

  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() - (DAYS - 1));

  for (let i = 0; i < DAYS; i++) {
    const key = isoDate(cursor);
    series.push({ date: key, grams: byDate.get(key) ?? 0, logged: byDate.has(key) });
    cursor.setDate(cursor.getDate() + 1);
  }
  return series;
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 tabular-nums mt-0.5">
        {value}
      </p>
      {sub && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export function ProteinTab({ summary }: { summary: ProteinSummary | null }) {
  const series = useMemo(() => (summary ? buildSeries(summary) : []), [summary]);

  const stats = useMemo(() => {
    if (!summary) return null;
    const goal = summary.goal_grams;
    const loggedDays = series.filter((day) => day.logged);
    const atGoal = loggedDays.filter((day) => day.grams >= goal).length;
    const average = loggedDays.length
      ? Math.round(loggedDays.reduce((sum, day) => sum + day.grams, 0) / loggedDays.length)
      : 0;

    // Consecutive days at goal, counting back from the most recent logged day
    let streak = 0;
    for (let i = series.length - 1; i >= 0; i--) {
      if (!series[i].logged) {
        if (streak === 0 && i === series.length - 1) continue; // today may be in progress
        break;
      }
      if (series[i].grams >= goal) streak++;
      else break;
    }

    return { goal, average, atGoal, loggedCount: loggedDays.length, streak };
  }, [summary, series]);

  if (!summary || !stats || stats.loggedCount === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg p-8 text-center shadow-sm">
        <p className="text-slate-600 dark:text-slate-400">No protein logged yet</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Log from the home screen and your trend shows up here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatTile
          label="Avg / logged day"
          value={`${stats.average}g`}
          sub={`goal ${stats.goal}g`}
        />
        <StatTile
          label="Days at goal"
          value={`${stats.atGoal}`}
          sub={`of ${stats.loggedCount} logged`}
        />
        <StatTile
          label="Current streak"
          value={`${stats.streak}`}
          sub={stats.streak === 1 ? 'day' : 'days'}
        />
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-1">
          Daily Protein
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Last {DAYS} days &middot; the line is your {stats.goal}g goal &middot; empty bars are days you didn&apos;t log
        </p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} barCategoryGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="#9CA3AF"
                tick={{ fill: '#9CA3AF', fontSize: 11 }}
                interval={6}
                tickFormatter={(value) =>
                  new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })
                }
              />
              <YAxis
                stroke="#9CA3AF"
                tick={{ fill: '#9CA3AF', fontSize: 11 }}
                label={{ value: 'g', angle: -90, position: 'insideLeft', fill: '#9CA3AF' }}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px' }}
                labelStyle={{ color: '#F3F4F6' }}
                cursor={{ fill: 'rgba(148, 163, 184, 0.15)' }}
                labelFormatter={(value) => new Date(`${value}T00:00:00`).toLocaleDateString()}
                formatter={(value: number, _name, item) => [
                  item?.payload?.logged ? `${value}g` : 'not logged',
                  'Protein',
                ]}
              />
              <ReferenceLine
                y={stats.goal}
                stroke="#10B981"
                strokeDasharray="4 4"
                strokeWidth={2}
              />
              <Bar dataKey="grams" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Protein" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
