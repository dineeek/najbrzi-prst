import { describe, expect, it } from 'vitest';
import { defaultTask, newStep, stepWithoutButton } from '../shared/models';

describe('stepWithoutButton', () => {
  it('points at the first step that has neither a selector nor a text', () => {
    const steps = [
      newStep('Submit', 'Submit'),
      newStep('Step 2', '  '),
      newStep('Step 3', '')
    ];
    expect(stepWithoutButton(steps)).toBe(1);
  });

  it('accepts a step picked by selector only', () => {
    const step = newStep('Icon', '');
    step.target.selector = '#go';
    expect(stepWithoutButton([step])).toBe(-1);
  });

  it('flags the empty step of a new generic task and passes the eFZOEU preset', () => {
    expect(stepWithoutButton(defaultTask('example.com').steps)).toBe(0);
    expect(stepWithoutButton(defaultTask('efzoeu.gov.hr').steps)).toBe(-1);
  });
});
