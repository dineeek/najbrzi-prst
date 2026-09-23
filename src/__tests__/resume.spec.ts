import { describe, expect, it } from 'vitest';
import { PAST_GRACE_MS, STALE_RUN_MS, resumeVerdict } from '../shared/resume';
import type { ArmedState } from '../shared/models';

const now = 1_800_000_000_000;
const hour = 60 * 60 * 1000;
const armed = (overrides: Partial<ArmedState> = {}): ArmedState => ({
  runId: 'tab-a',
  mode: 'live',
  phase: 'waiting',
  stepIndex: 0,
  reloads: 0,
  phaseStartedAt: now - 1000,
  results: [],
  ...overrides
});

describe('resumeVerdict', () => {
  it('resumes a fresh waiting state with a future fire time', () => {
    expect(resumeVerdict(armed(), 'tab-a', now + 60_000, now, now)).toBe(
      'resume'
    );
  });

  it('resumes a waiting state armed hours before the opening', () => {
    const early = armed({ phaseStartedAt: now - 2 * hour });
    expect(resumeVerdict(early, 'tab-a', now + hour, now, now)).toBe('resume');
  });

  it('rejects a waiting state whose fire time passed long ago', () => {
    expect(
      resumeVerdict(armed(), 'tab-a', now - PAST_GRACE_MS - 1, now, now)
    ).toBe('past');
  });

  it('resumes an executing state right after a reload even though the fire time passed', () => {
    expect(
      resumeVerdict(
        armed({ phase: 'executing' }),
        'tab-a',
        now - 5000,
        now,
        now
      )
    ).toBe('resume');
  });

  it('resumes a fire-now run when no opening time is set', () => {
    expect(
      resumeVerdict(armed({ phase: 'executing' }), 'tab-a', NaN, now, now)
    ).toBe('resume');
  });

  it('rejects an executing state that started longer ago than the stale window', () => {
    const old = armed({
      phase: 'executing',
      phaseStartedAt: now - STALE_RUN_MS - 1
    });
    expect(resumeVerdict(old, 'tab-a', now + 60_000, now, now)).toBe('stale');
  });

  it('rejects a waiting state when no opening time is configured', () => {
    expect(resumeVerdict(armed(), 'tab-a', NaN, now, now)).toBe('no-time');
  });

  it('leaves a live run armed in another tab alone', () => {
    expect(resumeVerdict(armed(), 'tab-b', now + 60_000, now, now)).toBe(
      'other-tab'
    );
    expect(resumeVerdict(armed(), null, now + 60_000, now, now)).toBe(
      'other-tab'
    );
  });

  it('reports a dead state as stale even when another tab armed it', () => {
    expect(
      resumeVerdict(armed(), 'tab-b', now - PAST_GRACE_MS - 1, now, now)
    ).toBe('past');
  });
});
