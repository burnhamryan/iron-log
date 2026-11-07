// RIR (reps in reserve) parsing and display, shared by the Excel import and
// the UI.
//
// Programs write RIR as a single number ("2"), a range ("1-2"), or one value
// per set ("2/1/0"). Excel quietly turns "1-2" into a date - 1 Feb or 2 Jan
// depending on locale - and the import then saw a serial like 36923. That got
// stored as RIR and shown on the TV as "RIR 36923".

export interface ParsedRir {
  rir: number | null;
  rirMax: number | null;
}

const NONE: ParsedRir = { rir: null, rirMax: null };
const MAX_PLAUSIBLE_RIR = 5;

const plausible = (n: number) => Number.isInteger(n) && n >= 0 && n <= MAX_PLAUSIBLE_RIR;

function range(a: number, b: number): ParsedRir {
  if (!plausible(a) || !plausible(b)) return NONE;
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  return { rir: low, rirMax: high === low ? null : high };
}

/** Recover "a-b" from a date Excel made out of it; day and month are the two numbers. */
function fromDateParts(day: number, month: number): ParsedRir {
  return range(day, month);
}

function fromExcelSerial(serial: number): ParsedRir {
  // Excel's day 0 is 1899-12-30 (accounting for its 1900 leap-year bug)
  const date = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000);
  if (Number.isNaN(date.getTime())) return NONE;
  return fromDateParts(date.getUTCDate(), date.getUTCMonth() + 1);
}

export function parseRir(raw: unknown): ParsedRir {
  if (raw === null || raw === undefined || raw === '') return NONE;

  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? NONE : fromDateParts(raw.getUTCDate(), raw.getUTCMonth() + 1);
  }

  if (typeof raw === 'number') {
    if (plausible(raw)) return { rir: raw, rirMax: null };
    // Anything past a month of days is a date serial, not a rep count
    if (raw > 31) return fromExcelSerial(raw);
    return NONE;
  }

  const text = String(raw).trim();
  if (!text) return NONE;

  // "1-2", "1–2", "1 to 2"
  const rangeMatch = text.match(/^(\d+)\s*(?:-|–|—|to)\s*(\d+)$/i);
  if (rangeMatch) return range(Number(rangeMatch[1]), Number(rangeMatch[2]));

  // "2/1/0" is one value per set: keep the first, as the import always has
  if (text.includes('/')) {
    const first = Number.parseInt(text.split('/')[0].trim(), 10);
    return plausible(first) ? { rir: first, rirMax: null } : NONE;
  }

  const n = Number(text);
  if (Number.isFinite(n)) return parseRir(n);
  return NONE;
}

/** "1–2" for a range, "2" for a single value. */
export function formatRir(rir: number | null | undefined, rirMax?: number | null): string {
  if (rir === null || rir === undefined) return '';
  return rirMax !== null && rirMax !== undefined && rirMax !== rir ? `${rir}–${rirMax}` : String(rir);
}
