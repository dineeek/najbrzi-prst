import type { ArmedState } from './models';

export const STALE_RUN_MS = 15 * 60 * 1000;
export const PAST_GRACE_MS = 60 * 1000;

export type ResumeVerdict =
  'resume' | 'stale' | 'past' | 'no-time' | 'other-tab';

export function resumeVerdict(
  armed: ArmedState,
  tabRunId: string | null,
  fireAtServerMs: number,
  nowServerMs: number,
  nowLocalMs: number
): ResumeVerdict {
  if (armed.phase === 'executing') {
    if (nowLocalMs - armed.phaseStartedAt > STALE_RUN_MS) return 'stale';
  } else {
    if (Number.isNaN(fireAtServerMs)) return 'no-time';
    if (fireAtServerMs < nowServerMs - PAST_GRACE_MS) return 'past';
  }
  return armed.runId === tabRunId ? 'resume' : 'other-tab';
}
