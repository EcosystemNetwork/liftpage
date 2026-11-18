const ZONE = "America/Los_Angeles";

export function ptOffsetMinutes(date: Date): number {
  const name =
    new Intl.DateTimeFormat("en-US", {
      timeZone: ZONE,
      timeZoneName: "shortOffset",
    })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT-8";
  const match = name.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!match) return -480;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

export function zonedISO(y: number, m: number, d: number, hh: number, mm: number): string {
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);
  const offset = ptOffsetMinutes(new Date(asUtc));
  const sign = offset <= 0 ? "-" : "+";
  const abs = Math.abs(offset);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export function ptYMD(date = new Date()): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { y: pick("year"), m: pick("month"), d: pick("day") };
}

export function addDays(y: number, m: number, d: number, n: number) {
  const next = new Date(Date.UTC(y, m - 1, d + n));
  return { y: next.getUTCFullYear(), m: next.getUTCMonth() + 1, d: next.getUTCDate() };
}

const HOURS: Array<[number, number]> = [
  [8, 12],
  [11, 5],
  [12, 40],
  [18, 20],
  [19, 10],
];

export function futureSlots(count: number, now = new Date()): string[] {
  const start = ptYMD(now);
  const slots: string[] = [];
  for (let day = 0; day < 16 && slots.length < count; day += 1) {
    const date = addDays(start.y, start.m, start.d, day);
    for (const [hh, mm] of HOURS) {
      if (slots.length >= count) break;
      const iso = zonedISO(date.y, date.m, date.d, hh, mm);
      if (new Date(iso).getTime() > now.getTime() + 10 * 60_000) slots.push(iso);
    }
  }
  return slots;
}

export function formatSlot(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** "Nov 18, 2:05 PM" in Pacific, for message stamps. */
export function formatStamp(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function formatClock(date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
