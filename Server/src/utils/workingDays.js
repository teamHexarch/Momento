// Working days (Monday to Friday) for review deadlines, counted on the team's calendar (REVIEW_TIMEZONE,
// Australia/Sydney unless set). Days are 'YYYY-MM-DD' strings in that time zone.
const TZ = process.env.REVIEW_TIMEZONE || 'Australia/Sydney';
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

export const localDay = (date = new Date()) => fmt.format(new Date(date));
const isWeekend = (day) => { const w = new Date(day + 'T12:00:00Z').getUTCDay(); return w === 0 || w === 6; };
const nextDay = (day) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

// The day a review is due: `days` working days after `from` (a review promised "within 1-2 working days" is due
// on the second working day after the upload)
export function dueDay(from, days = 2) {
  let day = localDay(from), left = days;
  while (left > 0) { day = nextDay(day); if (!isWeekend(day)) left--; }
  return day;
}

// Working days left until `due`: 1 = due tomorrow (the next working day), 0 = due today, -1 = overdue
export function workingDaysLeft(due, now = new Date()) {
  let day = localDay(now);
  if (day === due) return 0;
  if (day > due) return -1;
  let n = 0;
  while (day < due) { day = nextDay(day); if (!isWeekend(day)) n++; }
  return n;
}
