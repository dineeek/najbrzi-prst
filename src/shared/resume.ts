import type { ArmedState } from './models';

export const STALE_ARM_MS = 15 * 60 * 1000;
export const PAST_GRACE_MS = 60 * 1000;

export type ResumeVerdict = 'resume' | 'stale' | 'past' | 'no-time';

export function resumeVerdict(
  armed: ArmedState,
  fireAtServerMs: number,
  nowServerMs: number,
  nowLocalMs: number
): ResumeVerdict {
  if (Number.isNaN(fireAtServerMs)) return 'no-time';
  if (nowLocalMs - armed.armedAt > STALE_ARM_MS) return 'stale';
  if (armed.phase === 'waiting' && fireAtServerMs < nowServerMs - PAST_GRACE_MS)
    return 'past';
  return 'resume';
}
