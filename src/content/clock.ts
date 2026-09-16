import type { ClockSync } from '../shared/models';
import { t } from '../shared/i18n';

export interface Probe {
  serverSec: number;
  sentAt: number;
  receivedAt: number;
}

export type ProbeFn = () => Promise<Probe>;
export type SleepFn = (ms: number) => Promise<void>;

export const sleep: SleepFn = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

export async function probeDateHeader(
  url: string,
  credentials: RequestCredentials = 'omit'
): Promise<Probe> {
  const sentAt = Date.now();
  const response = await fetch(url, {
    method: 'HEAD',
    cache: 'no-store',
    credentials,
    redirect: 'follow'
  });
  const receivedAt = Date.now();
  const date = response.headers.get('date');
  if (!date) throw new Error(t('err_no_date_header', url));
  const serverMs = Date.parse(date);
  if (Number.isNaN(serverMs)) throw new Error(t('err_bad_date_header', date));
  return { serverSec: Math.floor(serverMs / 1000), sentAt, receivedAt };
}

const PROBE_PATHS = ['/favicon.ico', '/icon/favicon.ico', '/robots.txt', '/'];

export function probeCandidates(origin: string, pagePath: string): string[] {
  const paths = [...PROBE_PATHS, pagePath].filter(
    (path, index, all) => all.indexOf(path) === index
  );
  return paths.map(path => origin + path);
}

interface Chosen {
  url: string;
  credentials: RequestCredentials;
}

export function originProbe(origin: string, pagePath: string): ProbeFn {
  const candidates = probeCandidates(origin, pagePath);
  let chosen: Chosen | null = null;
  return async () => {
    if (chosen) {
      try {
        return await probeDateHeader(chosen.url, chosen.credentials);
      } catch (error) {
        chosen = null;
        throw error;
      }
    }
    let lastError: unknown = null;
    for (const credentials of ['omit', 'same-origin'] as const) {
      for (const url of candidates) {
        try {
          const probe = await probeDateHeader(url, credentials);
          chosen = { url, credentials };
          return probe;
        } catch (error) {
          lastError = error;
        }
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(t('err_sync_unreachable', origin));
  };
}

export interface OffsetInterval {
  minMs: number;
  maxMs: number;
  rttMs: number;
}

export interface Boundary extends OffsetInterval {
  observedAt: number;
}

export interface BoundaryOptions {
  maxProbes: number;
  gapMs: number;
  sleep?: SleepFn;
}

export async function findSecondBoundary(
  probe: ProbeFn,
  options: BoundaryOptions
): Promise<Boundary | null> {
  const wait = options.sleep ?? sleep;
  let previous = await probe();
  for (let i = 1; i < options.maxProbes; i++) {
    await wait(options.gapMs);
    const current = await probe();
    if (current.serverSec > previous.serverSec) {
      const boundaryMs = current.serverSec * 1000;
      return {
        minMs: boundaryMs - current.receivedAt,
        maxMs: boundaryMs - previous.sentAt,
        rttMs: current.receivedAt - current.sentAt,
        observedAt: previous.sentAt
      };
    }
    previous = current;
  }
  return null;
}

export function intersect(intervals: OffsetInterval[]): OffsetInterval | null {
  if (!intervals.length) return null;
  let minMs = -Infinity;
  let maxMs = Infinity;
  let rttMs = Infinity;
  for (const interval of intervals) {
    minMs = Math.max(minMs, interval.minMs);
    maxMs = Math.min(maxMs, interval.maxMs);
    rttMs = Math.min(rttMs, interval.rttMs);
  }
  if (minMs > maxMs) {
    return {
      minMs: Math.min(...intervals.map(interval => interval.minMs)),
      maxMs: Math.max(...intervals.map(interval => interval.maxMs)),
      rttMs
    };
  }
  return { minMs, maxMs, rttMs };
}

export function toSync(interval: OffsetInterval, source: string): ClockSync {
  return {
    offsetMs: (interval.minMs + interval.maxMs) / 2,
    uncertaintyMs: Math.max(1, (interval.maxMs - interval.minMs) / 2),
    rttMs: interval.rttMs,
    syncedAt: Date.now(),
    source
  };
}

export function coarseSync(probe: Probe, source: string): ClockSync {
  const rttMs = probe.receivedAt - probe.sentAt;
  return toSync(
    {
      minMs: probe.serverSec * 1000 - probe.receivedAt,
      maxMs: probe.serverSec * 1000 + 1000 - probe.sentAt,
      rttMs
    },
    source
  );
}

export interface SyncOptions extends BoundaryOptions {
  rounds: number;
  aimLeadMs?: number;
  now?: () => number;
}

export async function syncClock(
  probe: ProbeFn,
  source: string,
  options: SyncOptions
): Promise<ClockSync> {
  const wait = options.sleep ?? sleep;
  const now = options.now ?? Date.now;
  const aimLeadMs = options.aimLeadMs ?? 150;
  const intervals: OffsetInterval[] = [];
  let nextBoundaryAt: number | null = null;
  let lastError: unknown = null;
  for (let round = 0; round < options.rounds; round++) {
    try {
      if (nextBoundaryAt !== null) {
        const lead = nextBoundaryAt - aimLeadMs - now();
        if (lead > 0) await wait(lead);
      }
      const boundary = await findSecondBoundary(probe, options);
      if (boundary) {
        intervals.push(boundary);
        nextBoundaryAt = boundary.observedAt + 1000;
      } else {
        nextBoundaryAt = null;
      }
    } catch (error) {
      lastError = error;
      nextBoundaryAt = null;
    }
  }
  const combined = intersect(intervals);
  if (combined) return toSync(combined, source);
  if (lastError) throw lastError;
  return coarseSync(await probe(), source);
}

export class ServerClock {
  sync: ClockSync | null = null;
  private pending: Promise<ClockSync> | null = null;

  constructor(
    readonly source: string,
    private readonly probe: ProbeFn
  ) {}

  now(): number {
    return Date.now() + (this.sync?.offsetMs ?? 0);
  }

  get isSyncing(): boolean {
    return !!this.pending;
  }

  resync(rounds = 4): Promise<ClockSync> {
    this.pending ??= syncClock(this.probe, this.source, {
      rounds,
      maxProbes: 40,
      gapMs: 25
    })
      .then(sync => {
        this.sync = sync;
        return sync;
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }
}
