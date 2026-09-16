import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Overlay, type OverlayCallbacks } from '../content/overlay';
import { defaultTask } from '../shared/models';
import { setLanguage } from '../shared/i18n';
import { mockLayout } from './__mocks__/layout';

beforeAll(mockLayout);

function callbacks(): OverlayCallbacks {
  return {
    now: () => Date.now(),
    onLanguageChange: vi.fn(),
    onTaskChange: vi.fn(),
    onArm: vi.fn(),
    onStop: vi.fn(),
    onSync: vi.fn(),
    onPick: vi.fn()
  };
}

function controls(overlay: Overlay) {
  const root = overlay.root;
  return {
    date: root.querySelector<HTMLInputElement>('input[type="date"]')!,
    stepLabel: root.querySelector<HTMLInputElement>(
      '.step input[type="text"]'
    )!,
    pick: root.querySelector<HTMLButtonElement>('.step button')!,
    stop: root.querySelector<HTMLButtonElement>('.btn.stop')!,
    language: root.querySelector<HTMLSelectElement>('select.lang')!,
    sync: root.querySelector<HTMLButtonElement>('.sync button')!
  };
}

describe('Overlay', () => {
  beforeEach(() => {
    setLanguage('hr');
    document.documentElement.innerHTML = '<head></head><body></body>';
  });

  it('locks every setting while armed and unlocks on stop', () => {
    const overlay = new Overlay(defaultTask('efzoeu.gov.hr'), callbacks());
    overlay.mount();
    const before = controls(overlay);
    expect(before.date.disabled).toBe(false);
    expect(before.stop.disabled).toBe(true);

    overlay.setArmed({ mode: 'live' });
    const armed = controls(overlay);
    expect(armed.date.disabled).toBe(true);
    expect(armed.stepLabel.disabled).toBe(true);
    expect(armed.pick.disabled).toBe(true);
    expect(armed.stop.disabled).toBe(false);
    expect(armed.language.disabled).toBe(false);
    expect(armed.sync.disabled).toBe(false);

    overlay.setArmed(null);
    const idle = controls(overlay);
    expect(idle.date.disabled).toBe(false);
    expect(idle.pick.disabled).toBe(false);
    expect(idle.stop.disabled).toBe(true);
    overlay.destroy();
  });

  it('keeps the lock after a language rebuild while armed', () => {
    const overlay = new Overlay(defaultTask(), callbacks());
    overlay.mount();
    overlay.setArmed({ mode: 'manual' });
    setLanguage('en');
    overlay.rebuild();
    const after = controls(overlay);
    expect(after.date.disabled).toBe(true);
    expect(after.stop.disabled).toBe(false);
    expect(overlay.root.querySelector('.badge')?.textContent).toBe('MANUAL');
    overlay.destroy();
  });
});
