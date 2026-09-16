import { t } from './i18n';

export interface Target {
  selector: string;
  text: string;
  tag: string;
}

export interface Step {
  id: string;
  label: string;
  target: Target;
  timeoutMs: number;
  maxAttempts: number;
  retryIntervalMs: number;
  settleMs: number;
  expectText: string;
}

export interface ReloadPolicy {
  isEnabled: boolean;
  afterMs: number;
  intervalMs: number;
  maxReloads: number;
}

export interface Task {
  openingWallTime: string;
  leadMs: number;
  reload: ReloadPolicy;
  steps: Step[];
  successText: string;
  neverClickText: string;
  alertText: string;
  isSoundOn: boolean;
  isPanelOpen: boolean;
}

export type RunMode = 'dry' | 'manual' | 'live';
export type RunPhase = 'waiting' | 'executing';

export interface StepResult {
  stepIndex: number;
  clickedAtServerMs: number;
  attempts: number;
  via: 'selector' | 'text';
  isFinal: boolean;
  satisfiedBy: 'expect' | 'success' | 'next' | 'none' | 'skipped';
}

export interface ArmedState {
  mode: RunMode;
  phase: RunPhase;
  stepIndex: number;
  reloads: number;
  armedAt: number;
  results: StepResult[];
}

export interface ClockSync {
  offsetMs: number;
  uncertaintyMs: number;
  rttMs: number;
  syncedAt: number;
  source: string;
}

export type RunnerEvent =
  | { type: 'armed'; mode: RunMode; fireAtServerMs: number }
  | { type: 'step-start'; stepIndex: number }
  | { type: 'click'; stepIndex: number; attempt: number; atServerMs: number }
  | { type: 'step-done'; result: StepResult }
  | { type: 'reloading'; reloads: number }
  | { type: 'finished'; results: StepResult[] }
  | { type: 'failed'; stepIndex: number; reason: string }
  | { type: 'warning'; stepIndex: number; reason: string }
  | { type: 'stopped' };

const EFZOEU_HOSTS = ['efzoeu.gov.hr', 'fondovi.gov.hr'];

export const DEFAULT_NEVER_CLICK =
  '/odustani|vrati me|natrag|zatvori|prekini|otka[zž]|^ne\\b|cancel|^no\\b|close|go back|abort|dismiss/';
const DEFAULT_ALERT =
  '/session expired|session has expired|signed out|logged out/';
const EFZOEU_ALERT =
  '/sesija je istekla|prijavite se ponovno|session expired|session has expired/';

export function isEfzoeuHost(host: string): boolean {
  return EFZOEU_HOSTS.some(
    known => host === known || host.endsWith(`.${known}`)
  );
}

export function emptyTarget(): Target {
  return { selector: '', text: '', tag: 'button' };
}

export function newStep(label: string, text: string): Step {
  return {
    id: Math.random().toString(36).slice(2, 10),
    label,
    target: { ...emptyTarget(), text },
    timeoutMs: 15000,
    maxAttempts: 30,
    retryIntervalMs: 400,
    settleMs: 700,
    expectText: ''
  };
}

function baseTask(
  steps: Step[],
  successText: string,
  alertText = DEFAULT_ALERT
): Task {
  return {
    openingWallTime: '',
    leadMs: 0,
    reload: { isEnabled: true, afterMs: 750, intervalMs: 1000, maxReloads: 90 },
    steps,
    successText,
    neverClickText: DEFAULT_NEVER_CLICK,
    alertText,
    isSoundOn: true,
    isPanelOpen: true
  };
}

function efzoeuTask(): Task {
  const submit = newStep('Podnesi prijavu', 'Podnesi prijavu');
  submit.expectText = 'Jeste li sigurni';
  const confirm = newStep('Da, podnesi prijavu', '/^da\\b/');
  confirm.maxAttempts = 1;
  confirm.retryIntervalMs = 0;
  confirm.settleMs = 12000;
  confirm.timeoutMs = 8000;
  confirm.expectText = 'Prijava uspješno podnesena';
  return baseTask(
    [submit, confirm],
    'Prijava uspješno podnesena',
    EFZOEU_ALERT
  );
}

export function defaultTask(host = ''): Task {
  if (isEfzoeuHost(host)) return efzoeuTask();
  return baseTask([newStep(t('step_default_label', 1), '')], '');
}
