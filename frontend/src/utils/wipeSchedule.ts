/**
 * Расписание вайпов и голосования за карту (МСК).
 *
 * Вайпы:
 * — якорь: первый четверг месяца в 20:30;
 * — далее каждые 10 дней в 17:30;
 * — если до следующего первого четверга меньше 5 дней — промежуточный вайп пропускаем.
 *
 * Голосование:
 * — первый четверг: с 15:00 среды до 20:00 четверга, рестарт 20:30;
 * — остальные дни вайпа: с 15:00 дня перед вайпом до 17:00 в день вайпа, рестарт 17:30
 *   (как «среда → четверг», если вайп в четверг).
 */

export const MSK_TZ = 'Europe/Moscow';
export const WIPE_STEP_DAYS = 10;
export const WIPE_SKIP_IF_DAYS_BEFORE_ANCHOR_LT = 5;

/** Рестарт в первый четверг месяца. */
export const ANCHOR_WIPE_HOUR_MSK = 20;
export const ANCHOR_WIPE_MINUTE_MSK = 30;
/** Рестарт в промежуточные дни вайпа. */
export const MID_WIPE_HOUR_MSK = 17;
export const MID_WIPE_MINUTE_MSK = 30;

export const ANCHOR_VOTE_END_HOUR_MSK = 20;
export const ANCHOR_VOTE_END_MINUTE_MSK = 0;
export const MID_VOTE_OPEN_HOUR_MSK = 15;
export const MID_VOTE_OPEN_MINUTE_MSK = 0;
export const MID_VOTE_END_HOUR_MSK = 17;
export const MID_VOTE_END_MINUTE_MSK = 0;
/** Открытие голосования перед первым четвергом (среда 15:00). */
export const ANCHOR_VOTE_OPEN_HOUR_MSK = 15;
export const ANCHOR_VOTE_OPEN_MINUTE_MSK = 0;

export const WIPE_SCHEDULE_HINT_DEFAULT =
  'Вайп: первый четверг месяца в 20:30 МСК, далее каждые 10 дней в 17:30 МСК. ' +
  'Если до следующего первого четверга меньше 5 дней — промежуточный вайп пропускается.';

export const MAP_VOTE_SCHEDULE_HINT_DEFAULT =
  'Голосование: перед первым четвергом — со среды 15:00 до четверга 20:00 (рестарт 20:30). ' +
  'В остальные дни вайпа — с 15:00 дня перед вайпом до 17:00 в день вайпа (рестарт 17:30).';

export interface CivilDate {
  year: number;
  month: number; // 1–12
  day: number;
}

export interface MapVoteWindow {
  wipeAt: Date;
  opensAt: Date;
  endsAt: Date;
  isAnchor: boolean;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function mskDateTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): Date {
  return new Date(
    `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:00+03:00`
  );
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

export function isFirstThursdayCivil(date: CivilDate): boolean {
  const anchor = firstThursdayOfMonth(date.year, date.month);
  return anchor.year === date.year && anchor.month === date.month && anchor.day === date.day;
}

export function isAnchorWipeInstant(wipeAt: Date): boolean {
  return isFirstThursdayCivil(mskCivilDateFromInstant(wipeAt));
}

/** Момент рестарта/вайпа в МСК для календарной даты. */
export function wipeInstantForCivilDate(date: CivilDate, isAnchor = isFirstThursdayCivil(date)): Date {
  if (isAnchor) {
    return mskDateTime(date.year, date.month, date.day, ANCHOR_WIPE_HOUR_MSK, ANCHOR_WIPE_MINUTE_MSK);
  }
  return mskDateTime(date.year, date.month, date.day, MID_WIPE_HOUR_MSK, MID_WIPE_MINUTE_MSK);
}

/** Подпись времени рестарта для календаря. */
export function wipeRestartLabelMsk(wipeAt: Date): string {
  return isAnchorWipeInstant(wipeAt) ? '20:30' : '17:30';
}

/** @deprecated используйте wipeRestartLabelMsk */
export function wipeHourMskForInstant(wipeAt: Date): number {
  return isAnchorWipeInstant(wipeAt) ? ANCHOR_WIPE_HOUR_MSK : MID_WIPE_HOUR_MSK;
}

export function mapVoteWindowForWipe(wipeAt: Date): MapVoteWindow {
  const civil = mskCivilDateFromInstant(wipeAt);
  const isAnchor = isFirstThursdayCivil(civil);

  if (isAnchor) {
    const prev = addCivilDays(civil, -1);
    return {
      wipeAt,
      isAnchor: true,
      opensAt: mskDateTime(
        prev.year,
        prev.month,
        prev.day,
        ANCHOR_VOTE_OPEN_HOUR_MSK,
        ANCHOR_VOTE_OPEN_MINUTE_MSK
      ),
      endsAt: mskDateTime(
        civil.year,
        civil.month,
        civil.day,
        ANCHOR_VOTE_END_HOUR_MSK,
        ANCHOR_VOTE_END_MINUTE_MSK
      ),
    };
  }

  const prev = addCivilDays(civil, -1);
  return {
    wipeAt,
    isAnchor: false,
    opensAt: mskDateTime(
      prev.year,
      prev.month,
      prev.day,
      MID_VOTE_OPEN_HOUR_MSK,
      MID_VOTE_OPEN_MINUTE_MSK
    ),
    endsAt: mskDateTime(
      civil.year,
      civil.month,
      civil.day,
      MID_VOTE_END_HOUR_MSK,
      MID_VOTE_END_MINUTE_MSK
    ),
  };
}

export function nextMapVoteWindow(now: Date = new Date()): MapVoteWindow | null {
  // Берём вайпы с запасом на открытие со среды перед первым четвергом (~30ч)
  const wipes = upcomingWipeInstants(new Date(now.getTime() - 36 * 60 * 60 * 1000), 8);
  for (const wipeAt of wipes) {
    const win = mapVoteWindowForWipe(wipeAt);
    if (now.getTime() < win.endsAt.getTime()) return win;
  }
  return null;
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

    out.push(wipeInstantForCivilDate(cur, isAnchor));
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

export function isWipeCivilDate(date: CivilDate): boolean {
  return wipeInstantsForMonthCycle(date.year, date.month).some((w) => {
    const c = mskCivilDateFromInstant(w);
    return c.year === date.year && c.month === date.month && c.day === date.day;
  });
}

export function findWipeNear(now: Date, toleranceMs = 90_000): Date | null {
  const nearby = upcomingWipeInstants(new Date(now.getTime() - 3_600_000), 6);
  for (const w of nearby) {
    if (Math.abs(w.getTime() - now.getTime()) <= toleranceMs) return w;
  }
  const c = mskCivilDateFromInstant(now);
  for (const w of wipeInstantsForMonthCycle(c.year, c.month)) {
    if (Math.abs(w.getTime() - now.getTime()) <= toleranceMs) return w;
  }
  return null;
}
