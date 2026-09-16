import { describe, expect, it } from 'vitest';
import {
  epochToWallTime,
  formatClock,
  formatCountdown,
  formatSigned,
  normalizeWallTime,
  wallTimeToEpoch
} from '../shared/time';

const ZONE = 'Europe/Zagreb';

describe('wallTimeToEpoch', () => {
  it('treats winter wall time as CET (+01:00)', () => {
    expect(wallTimeToEpoch('2026-12-07T09:00:00', ZONE)).toBe(
      Date.parse('2026-12-07T08:00:00Z')
    );
  });

  it('treats summer wall time as CEST (+02:00)', () => {
    expect(wallTimeToEpoch('2026-09-02T09:00:00', ZONE)).toBe(
      Date.parse('2026-09-02T07:00:00Z')
    );
  });

  it('accepts datetime-local input without seconds', () => {
    expect(normalizeWallTime('2026-10-15T09:00')).toBe('2026-10-15T09:00:00');
    expect(wallTimeToEpoch('2026-10-15T09:00', ZONE)).toBe(
      Date.parse('2026-10-15T07:00:00Z')
    );
  });

  it('round-trips through epochToWallTime', () => {
    const epoch = wallTimeToEpoch('2026-03-29T02:30:00', ZONE);
    expect(epochToWallTime(epoch, ZONE)).toBe('2026-03-29T03:30:00');
  });

  it('returns NaN for garbage', () => {
    expect(wallTimeToEpoch('nope')).toBeNaN();
  });
});

describe('formatting', () => {
  it('formats a Zagreb clock with milliseconds', () => {
    expect(formatClock(Date.parse('2026-10-15T07:00:00.042Z'), ZONE)).toBe(
      '09:00:00.042'
    );
  });

  it('formats countdown before and after zero', () => {
    expect(formatCountdown(3723456)).toBe('T−01:02:03.456');
    expect(formatCountdown(-1002)).toBe('T+00:00:01.002');
  });

  it('formats signed offsets in seconds', () => {
    expect(formatSigned(12)).toBe('+0.012 s');
    expect(formatSigned(-1500)).toBe('−1.500 s');
  });
});
