import { describe, expect, it } from 'vitest';
import { mergeTask } from '../shared/storage';
import { defaultTask } from '../shared/models';
import type { Task } from '../shared/models';

describe('mergeTask', () => {
  it('returns the defaults when nothing is stored', () => {
    const base = defaultTask('efzoeu.gov.hr');
    expect(mergeTask(null, base)).toBe(base);
  });

  it('fills missing step fields from the step defaults', () => {
    const stored = {
      steps: [{ label: 'Go', target: { text: 'Go' } }]
    } as unknown as Partial<Task>;
    const task = mergeTask(stored, defaultTask());
    expect(task.steps).toHaveLength(1);
    expect(task.steps[0].label).toBe('Go');
    expect(task.steps[0].target).toEqual({
      selector: '',
      text: 'Go',
      tag: 'button'
    });
    expect(task.steps[0].expectText).toBe('');
    expect(task.steps[0].settleMs).toBe(700);
    expect(task.steps[0].maxAttempts).toBe(30);
  });

  it('sanitizes garbage numbers and keeps sensible minimums', () => {
    const stored = {
      leadMs: 'abc',
      reload: { intervalMs: 5, maxReloads: -3 },
      steps: [{ settleMs: 'x', maxAttempts: 0, timeoutMs: 1 }]
    } as unknown as Partial<Task>;
    const task = mergeTask(stored, defaultTask());
    expect(task.leadMs).toBe(0);
    expect(task.reload.intervalMs).toBe(500);
    expect(task.reload.maxReloads).toBe(0);
    expect(task.reload.isEnabled).toBe(true);
    expect(task.steps[0].settleMs).toBe(700);
    expect(task.steps[0].maxAttempts).toBe(1);
    expect(task.steps[0].timeoutMs).toBe(100);
  });

  it('keeps the eFZOEU preset only on eFZOEU hosts', () => {
    expect(defaultTask('efzoeu.gov.hr').steps[0].target.text).toBe(
      'Podnesi prijavu'
    );
    expect(defaultTask('fondovi.gov.hr').successText).toBe(
      'Prijava uspješno podnesena'
    );
    expect(defaultTask('example.com').steps).toHaveLength(1);
    expect(defaultTask('example.com').steps[0].target.text).toBe('');
    expect(defaultTask('example.com').alertText).not.toContain('sesija');
    expect(defaultTask('efzoeu.gov.hr').alertText).toContain('sesija');
    expect(defaultTask('example.com').neverClickText).toContain('cancel');
  });
});
