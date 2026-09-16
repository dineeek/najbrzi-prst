import { beforeEach, describe, expect, it } from 'vitest';
import {
  getLanguage,
  isDefaultStepLabel,
  setLanguage,
  t
} from '../shared/i18n';

describe('t', () => {
  beforeEach(() => setLanguage(null));

  it('defaults to Croatian', () => {
    expect(getLanguage()).toBe('hr');
    expect(t('badge_idle')).toBe('NEAKTIVNO');
  });

  it('switches to English and back, ignoring unknown codes', () => {
    expect(setLanguage('en')).toBe('en');
    expect(t('badge_idle')).toBe('IDLE');
    expect(setLanguage('de')).toBe('hr');
  });

  it('substitutes numbered placeholders in order', () => {
    setLanguage('en');
    expect(t('log_click', 1, 2, '09:00:00.004')).toBe(
      'Step 1: click 2 at 09:00:00.004'
    );
  });

  it('drops placeholders that got no value', () => {
    setLanguage('en');
    expect(t('state_ready')).toBe('● Found, enabled ()');
  });

  it('recognizes the default step label in every language', () => {
    expect(isDefaultStepLabel('Korak 2', 1)).toBe(true);
    expect(isDefaultStepLabel('Step 2', 1)).toBe(true);
    expect(isDefaultStepLabel('Step 3', 1)).toBe(false);
    expect(isDefaultStepLabel('Podnesi prijavu', 0)).toBe(false);
  });
});
