import { describe, expect, it } from 'vitest';
import {
  ServerClock,
  coarseSync,
  findSecondBoundary,
  intersect,
  syncClock,
  toSync,
  type Probe
} from '../content/clock';

function fakeServer(offsetMs: number, rttMs: number, gapMs: number) {
  let local = 1_000_000;
  const probe = async (): Promise<Probe> => {
    const sentAt = local;
    const receivedAt = sentAt + rttMs;
    const stampedAt = sentAt + rttMs / 2;
    local = receivedAt;
    return {
      serverSec: Math.floor((stampedAt + offsetMs) / 1000),
      sentAt,
      receivedAt
    };
  };
  const sleep = async (ms: number) => {
    local += ms || gapMs;
  };
  const now = () => local;
  return { probe, sleep, now };
}

describe('findSecondBoundary', () => {
  it('brackets the true offset within the reported interval', async () => {
    const { probe, sleep } = fakeServer(12_345, 50, 25);
    const interval = await findSecondBoundary(probe, {
      maxProbes: 60,
      gapMs: 25,
      sleep
    });
    expect(interval).not.toBeNull();
    expect(interval!.minMs).toBeLessThanOrEqual(12_345);
    expect(interval!.maxMs).toBeGreaterThanOrEqual(12_345);
    expect(interval!.maxMs - interval!.minMs).toBeLessThanOrEqual(25 + 2 * 50);
  });

  it('returns null when no boundary passes within the probe budget', async () => {
    const { probe, sleep } = fakeServer(0, 1, 1);
    expect(
      await findSecondBoundary(probe, { maxProbes: 3, gapMs: 1, sleep })
    ).toBeNull();
  });
});

describe('intersect', () => {
  it('narrows overlapping intervals', () => {
    const joined = intersect([
      { minMs: 100, maxMs: 260, rttMs: 50 },
      { minMs: 180, maxMs: 300, rttMs: 40 }
    ]);
    expect(joined).toEqual({ minMs: 180, maxMs: 260, rttMs: 40 });
  });

  it('widens to the hull when samples do not overlap', () => {
    const joined = intersect([
      { minMs: 0, maxMs: 200, rttMs: 50 },
      { minMs: 300, maxMs: 350, rttMs: 40 }
    ]);
    expect(joined).toEqual({ minMs: 0, maxMs: 350, rttMs: 40 });
  });

  it('returns null for no intervals', () => {
    expect(intersect([])).toBeNull();
  });
});

describe('syncClock', () => {
  it('aims later rounds at the predicted boundary and probes far less', async () => {
    const { probe, sleep, now } = fakeServer(12_345, 50, 25);
    let probes = 0;
    const counted = async () => {
      probes++;
      return probe();
    };
    const sync = await syncClock(counted, 'test', {
      rounds: 4,
      maxProbes: 40,
      gapMs: 25,
      sleep,
      now
    });
    expect(probes).toBeLessThan(30);
    expect(Math.abs(sync.offsetMs - 12_345)).toBeLessThanOrEqual(
      sync.uncertaintyMs
    );
  });

  it('keeps going when one round throws and still returns a bracket', async () => {
    const { probe, sleep, now } = fakeServer(500, 40, 25);
    let calls = 0;
    const flaky = async () => {
      calls++;
      if (calls === 2) throw new Error('blip');
      return probe();
    };
    const sync = await syncClock(flaky, 'test', {
      rounds: 3,
      maxProbes: 60,
      gapMs: 25,
      sleep,
      now
    });
    expect(Math.abs(sync.offsetMs - 500)).toBeLessThanOrEqual(
      sync.uncertaintyMs
    );
  });

  it('lands within the uncertainty of the true offset', async () => {
    const { probe, sleep } = fakeServer(-7_777, 60, 25);
    const sync = await syncClock(probe, 'test', {
      rounds: 3,
      maxProbes: 60,
      gapMs: 25,
      sleep
    });
    expect(Math.abs(sync.offsetMs + 7_777)).toBeLessThanOrEqual(
      sync.uncertaintyMs
    );
    expect(sync.uncertaintyMs).toBeLessThan(100);
    expect(sync.source).toBe('test');
  });

  it('coarse sync reports about half a second of uncertainty', () => {
    const sync = coarseSync(
      { serverSec: 1000, sentAt: 1_000_200, receivedAt: 1_000_260 },
      'x'
    );
    expect(sync.uncertaintyMs).toBeGreaterThan(400);
    expect(toSync({ minMs: 0, maxMs: 10, rttMs: 5 }, 'x').offsetMs).toBe(5);
  });
});

describe('ServerClock', () => {
  it('shares one in-flight sync between concurrent callers', async () => {
    const { probe } = fakeServer(250, 1, 1);
    let calls = 0;
    const clock = new ServerClock('test', async () => {
      calls++;
      return probe();
    });
    const [a, b] = await Promise.all([clock.resync(1), clock.resync(1)]);
    expect(a).toBe(b);
    expect(clock.sync).toBe(a);
    expect(clock.isSyncing).toBe(false);
    const before = calls;
    await clock.resync(1);
    expect(calls).toBeGreaterThan(before);
  });
});
