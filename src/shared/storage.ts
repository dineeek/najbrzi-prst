import type { ArmedState, ClockSync, Step, Task } from './models';
import { defaultTask, emptyTarget, newStep } from './models';
import { isLanguage, t, type Language } from './i18n';

const LANGUAGE_KEY = 'language';

function key(kind: 'task' | 'armed' | 'clock', origin: string): string {
  return `${kind}:${origin}`;
}

async function read<T>(name: string): Promise<T | null> {
  const bag = await chrome.storage.local.get(name);
  return (bag[name] as T | undefined) ?? null;
}

async function write(name: string, value: unknown): Promise<void> {
  if (value === null) await chrome.storage.local.remove(name);
  else await chrome.storage.local.set({ [name]: value });
}

function hostOf(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return '';
  }
}

function num(value: unknown, fallback: number, min = -Infinity): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(min, parsed) : fallback;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function mergeStep(
  stored: Partial<Step> | null | undefined,
  index: number
): Step {
  const base = newStep(t('step_default_label', index + 1), '');
  const target = { ...emptyTarget(), ...(stored?.target ?? {}) };
  return {
    id: str(stored?.id) || base.id,
    label: str(stored?.label, base.label),
    target: {
      selector: str(target.selector),
      text: str(target.text),
      tag: str(target.tag, 'button')
    },
    timeoutMs: num(stored?.timeoutMs, base.timeoutMs, 100),
    maxAttempts: num(stored?.maxAttempts, base.maxAttempts, 1),
    retryIntervalMs: num(stored?.retryIntervalMs, base.retryIntervalMs, 0),
    settleMs: num(stored?.settleMs, base.settleMs, 100)
  };
}

export function mergeTask(stored: Partial<Task> | null, base: Task): Task {
  if (!stored) return base;
  const steps = Array.isArray(stored.steps) ? stored.steps : [];
  return {
    openingWallTime: str(stored.openingWallTime),
    leadMs: num(stored.leadMs, base.leadMs),
    reload: {
      isEnabled: stored.reload?.isEnabled ?? base.reload.isEnabled,
      afterMs: num(stored.reload?.afterMs, base.reload.afterMs, 0),
      intervalMs: num(stored.reload?.intervalMs, base.reload.intervalMs, 500),
      maxReloads: num(stored.reload?.maxReloads, base.reload.maxReloads, 0)
    },
    steps: steps.length ? steps.map(mergeStep) : base.steps,
    successText: str(stored.successText, base.successText),
    neverClickText: str(stored.neverClickText, base.neverClickText),
    alertText: str(stored.alertText, base.alertText),
    isSoundOn: stored.isSoundOn ?? base.isSoundOn,
    isPanelOpen: stored.isPanelOpen ?? base.isPanelOpen
  };
}

export async function loadTask(origin: string): Promise<Task> {
  const stored = await read<Partial<Task>>(key('task', origin));
  return mergeTask(stored, defaultTask(hostOf(origin)));
}

export function saveTask(origin: string, task: Task): Promise<void> {
  return write(key('task', origin), task);
}

export async function loadArmed(origin: string): Promise<ArmedState | null> {
  const stored = await read<Partial<ArmedState>>(key('armed', origin));
  if (!stored || !stored.mode || !stored.phase) return null;
  return {
    runId: str(stored.runId),
    mode: stored.mode,
    phase: stored.phase,
    stepIndex: num(stored.stepIndex, 0, 0),
    reloads: num(stored.reloads, 0, 0),
    phaseStartedAt: num(stored.phaseStartedAt, 0),
    results: Array.isArray(stored.results) ? stored.results : []
  };
}

export function saveArmed(
  origin: string,
  state: ArmedState | null
): Promise<void> {
  return write(key('armed', origin), state);
}

export async function loadLanguage(): Promise<Language | null> {
  const stored = await read<string>(LANGUAGE_KEY);
  return isLanguage(stored) ? stored : null;
}

export function saveLanguage(language: Language): Promise<void> {
  return write(LANGUAGE_KEY, language);
}

export function isLanguageChange(
  changes: Record<string, chrome.storage.StorageChange>
): Language | null {
  const next = changes[LANGUAGE_KEY]?.newValue;
  return isLanguage(next) ? next : null;
}

export function loadClock(origin: string): Promise<ClockSync | null> {
  return read<ClockSync>(key('clock', origin));
}

export function saveClock(
  origin: string,
  sync: ClockSync | null
): Promise<void> {
  return write(key('clock', origin), sync);
}
