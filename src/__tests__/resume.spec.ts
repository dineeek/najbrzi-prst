import { describe, expect, it } from 'vitest';
import { PAST_GRACE_MS, STALE_ARM_MS, resumeVerdict } from '../shared/resume';
import type { ArmedState } from '../shared/models';

const now = 1_800_000_000_000;
const armed = (overrides: Partial<ArmedState> = {}): ArmedState => ({
  mode: 'live',
  phase: 'waiting',
  stepIndex: 0,
  reloads: 0,
  armedAt: now - 1000,
  results: [],
  ...overrides
});

describe('resumeVerdict', () => {
  it('resumes a fresh waiting state with a future fire time', () => {
    expect(resumeVerdict(armed(), now + 60_000, now, now)).toBe('resume');
  });

  it('rejects a waiting state whose fire time passed long ago', () => {
    expect(resumeVerdict(armed(), now - PAST_GRACE_MS - 1, now, now)).toBe(
      'past'
    );
  });

  it('resumes an executing state right after a reload even though the fire time passed', () => {
    expect(
      resumeVerdict(armed({ phase: 'executing' }), now - 5000, now, now)
    ).toBe('resume');
  });

  it('rejects any state older than the stale window', () => {
    const old = armed({ phase: 'executing', armedAt: now - STALE_ARM_MS - 1 });
    expect(resumeVerdict(old, now + 60_000, now, now)).toBe('stale');
  });

  it('rejects when no opening time is configured', () => {
    expect(resumeVerdict(armed(), NaN, now, now)).toBe('no-time');
  });
});
