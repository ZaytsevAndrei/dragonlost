/**
 * Расписание вайпов:
 * — якорь: первый четверг месяца;
 * — далее каждые 10 дней;
 * — если до следующего первого четверга меньше 5 дней — промежуточный вайп пропускаем;
 * — время МСК: 21:00 в «летнее» (по календарю EU DST), 22:00 в «зимнее».
 *
 * Россия без DST; «лето/зима» = европейский сезон перевода часов (Berlin).
 */

export const MSK_TZ = 'Europe/Moscow';
export const WIPE_STEP_DAYS = 10;
export const WIPE_SKIP_IF_DAYS_BEFORE_ANCHOR_LT = 5;
export const WIPE_HOUR_SUMMER_MSK = 21;
export const WIPE_HOUR_WINTER_MSK = 22;

export const WIPE_SCHEDULE_HINT_DEFAULT =
  'Вайп: первый четверг месяца (21:00 МСК летом / 22:00 МСК зимой), далее каждые 10 дней. ' +
  'Если до следующего первого четверга меньше 5 дней — этот промежуточный вайп пропускается.';

export interface CivilDate {
  year: number;
  month: number; // 1–12
  day: number;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function lastSundayUtcDay(year: number, monthIndex0: number): number {
  const last = new Date(Date.UTC(year, monthIndex0 + 1, 0));
  return last.getUTCDate() - last.getUTCDay();
}

/** Европейский DST (CET/CEST): с последнего вс марта 01:00 UTC до последнего вс октября 01:00 UTC. */
export function isEuropeanSummerAt(instant: Date): boolean {
  const y = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: MSK_TZ, year: 'numeric' }).format(instant)
  );
  const start = Date.UTC(y, 2, lastSundayUtcDay(y, 2), 1, 0, 0);
  const end = Date.UTC(y, 9, lastSundayUtcDay(y, 9), 1, 0, 0);
  const t = instant.getTime();
  return t >= start && t < end;
}

export function wipeHourMskForInstant(instant: Date): number {
  return isEuropeanSummerAt(instant) ? WIPE_HOUR_SUMMER_MSK : WIPE_HOUR_WINTER_MSK;
}

export function firstThursdayOfMonth(year: number, month: number): CivilDate {
  for (let day = 1; day <= 7; day++) {
    if (new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay() === 4) {
      return { year, month, day };
    }
  }
  throw new Error(`No Thursday in first week of ${year}-${month}`);
}

export function addCivilDays(date: CivilDate, days: number): CivilDate {
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day + days, 12, 0, 0));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

export function civilDaysBetween(a: CivilDate, b: CivilDate): number {
  const aUtc = Date.UTC(a.year, a.month - 1, a.day);
  const bUtc = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((bUtc - aUtc) / 86_400_000);
}

/** Момент вайпа в МСК для календарной даты. */
export function wipeInstantForCivilDate(date: CivilDate): Date {
  const noon = new Date(
    `${date.year}-${pad2(date.month)}-${pad2(date.day)}T12:00:00+03:00`
  );
  const hour = wipeHourMskForInstant(noon);
  return new Date(
    `${date.year}-${pad2(date.month)}-${pad2(date.day)}T${pad2(hour)}:00:00+03:00`
  );
}

function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/** Все вайпы цикла месяца (от первого четверга до, не включая, следующий первый четверг). */
export function wipeInstantsForMonthCycle(year: number, month: number): Date[] {
  const anchor = firstThursdayOfMonth(year, month);
  const nm = nextMonth(year, month);
  const nextAnchor = firstThursdayOfMonth(nm.year, nm.month);
  const out: Date[] = [];
  let cur = anchor;

  while (true) {
    const daysToNextAnchor = civilDaysBetween(cur, nextAnchor);
    if (daysToNextAnchor <= 0) break;

    const isAnchor =
      cur.year === anchor.year && cur.month === anchor.month && cur.day === anchor.day;

    if (!isAnchor && daysToNextAnchor < WIPE_SKIP_IF_DAYS_BEFORE_ANCHOR_LT) {
      break;
    }

    out.push(wipeInstantForCivilDate(cur));
    cur = addCivilDays(cur, WIPE_STEP_DAYS);
  }

  return out;
}

/** Ближайшие будущие вайпы (строго после now), до max штук. */
export function upcomingWipeInstants(now: Date, max: number): Date[] {
  const out: Date[] = [];
  const y = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: MSK_TZ, year: 'numeric' }).format(now)
  );
  const m = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: MSK_TZ, month: 'numeric' }).format(now)
  );

  let year = y;
  let month = m;
  // предыдущий месяц — на случай если сейчас ещё в хвосте прошлого цикла
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const queue: Date[] = [
    ...wipeInstantsForMonthCycle(prev.year, prev.month),
    ...wipeInstantsForMonthCycle(year, month),
  ];

  while (out.length < max) {
    for (const w of queue) {
      if (w.getTime() > now.getTime()) out.push(w);
      if (out.length >= max) return out;
    }
    const n = nextMonth(year, month);
    year = n.year;
    month = n.month;
    queue.length = 0;
    queue.push(...wipeInstantsForMonthCycle(year, month));
  }

  return out;
}

/** Есть ли вайп в указанную календарную дату МСК (без учёта часа). */
export function isWipeCivilDate(date: CivilDate): boolean {
  return wipeInstantsForMonthCycle(date.year, date.month).some((w) => {
    const y = Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: MSK_TZ, year: 'numeric' }).format(w)
    );
    const m = Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: MSK_TZ, month: 'numeric' }).format(w)
    );
    const d = Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: MSK_TZ, day: 'numeric' }).format(w)
    );
    return y === date.year && m === date.month && d === date.day;
  });
}

/** Вайп прямо сейчас (окно ±toleranceMs вокруг точного момента). */
export function findWipeNear(now: Date, toleranceMs = 90_000): Date | null {
  const nearby = upcomingWipeInstants(new Date(now.getTime() - 3_600_000), 6);
  for (const w of nearby) {
    if (Math.abs(w.getTime() - now.getTime()) <= toleranceMs) return w;
  }
  // также прошедшие якоря в том же окне
  const y = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: MSK_TZ, year: 'numeric' }).format(now)
  );
  const m = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: MSK_TZ, month: 'numeric' }).format(now)
  );
  for (const w of wipeInstantsForMonthCycle(y, m)) {
    if (Math.abs(w.getTime() - now.getTime()) <= toleranceMs) return w;
  }
  return null;
}

export function mskCivilDateFromInstant(instant: Date): CivilDate {
  return {
    year: Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: MSK_TZ, year: 'numeric' }).format(instant)
    ),
    month: Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: MSK_TZ, month: 'numeric' }).format(instant)
    ),
    day: Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: MSK_TZ, day: 'numeric' }).format(instant)
    ),
  };
}
