export const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

const LOCALE =
  typeof navigator !== 'undefined' && navigator.language
    ? navigator.language
    : 'en-US';

const partFormatters = new Map<string, Intl.DateTimeFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function partFormatter(zone: string): Intl.DateTimeFormat {
  let formatter = partFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: zone
    });
    partFormatters.set(zone, formatter);
  }
  return formatter;
}

function dateFormatter(zone: string, locale: string): Intl.DateTimeFormat {
  const key = `${locale}|${zone}`;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: zone
    });
    dateFormatters.set(key, formatter);
  }
  return formatter;
}

function partsIn(epochMs: number, zone: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of partFormatter(zone).formatToParts(new Date(epochMs))) {
    if (part.type !== 'literal') out[part.type] = Number(part.value);
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function zoneOffsetMs(epochMs: number, zone = ZONE): number {
  const p = partsIn(epochMs, zone);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second
  );
  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

export function normalizeWallTime(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)
    ? `${trimmed}:00`
    : trimmed;
}

export function wallTimeToEpoch(wallTime: string, zone = ZONE): number {
  const normalized = normalizeWallTime(wallTime);
  const naive = Date.parse(`${normalized}Z`);
  if (Number.isNaN(naive)) return NaN;
  const firstGuess = naive - zoneOffsetMs(naive, zone);
  return naive - zoneOffsetMs(firstGuess, zone);
}

export function epochToWallTime(epochMs: number, zone = ZONE): string {
  const p = partsIn(epochMs, zone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

export function formatClock(epochMs: number, zone = ZONE): string {
  const p = partsIn(epochMs, zone);
  const millis = ((Math.floor(epochMs) % 1000) + 1000) % 1000;
  return `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}.${String(millis).padStart(3, '0')}`;
}

export function formatDate(
  epochMs: number,
  zone = ZONE,
  locale = LOCALE
): string {
  return dateFormatter(zone, locale).format(new Date(epochMs));
}

export function formatCountdown(remainingMs: number): string {
  const sign = remainingMs < 0 ? '+' : '−';
  const abs = Math.abs(remainingMs);
  const hours = Math.floor(abs / 3600000);
  const minutes = Math.floor((abs % 3600000) / 60000);
  const seconds = Math.floor((abs % 60000) / 1000);
  const millis = Math.floor(abs % 1000);
  return `T${sign}${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${String(millis).padStart(3, '0')}`;
}

export function formatSigned(ms: number): string {
  const sign = ms >= 0 ? '+' : '−';
  return `${sign}${(Math.abs(ms) / 1000).toFixed(3)} s`;
}
