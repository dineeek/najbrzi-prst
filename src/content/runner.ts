import type {
  ArmedState,
  RunMode,
  RunnerEvent,
  Step,
  StepResult,
  Task
} from '../shared/models';
import {
  clickElement,
  matchAnyText,
  readyTarget,
  waitFor,
  waitForTarget,
  type Resolved
} from '../shared/dom';
import { t } from '../shared/i18n';
import { sleep, type SleepFn } from './clock';

export interface RunnerDeps {
  serverNow: () => number;
  reload: () => void;
  persist: (state: ArmedState | null) => Promise<void>;
  emit: (event: RunnerEvent) => void;
  highlight: (el: HTMLElement) => void;
  handOver: (el: HTMLElement) => void;
  sleep?: SleepFn;
}

const DRY_TIMEOUT_MS = 1500;
const MANUAL_WAIT_MS = 90_000;

type Satisfied = 'expect' | 'success' | 'next';

interface Checks {
  expectText: string;
  successText: string;
  next: Step | null;
}

export class Runner {
  private abort: AbortController | null = null;
  private state: ArmedState | null = null;
  private isEphemeral = false;

  constructor(
    readonly task: Task,
    readonly fireAtServerMs: number,
    private readonly deps: RunnerDeps
  ) {}

  get isArmed(): boolean {
    return !!this.abort;
  }

  get mode(): RunMode | null {
    return this.state?.mode ?? null;
  }

  arm(mode: RunMode, fireNow = false): Promise<void> {
    return this.start(
      {
        mode,
        phase: fireNow ? 'executing' : 'waiting',
        stepIndex: 0,
        reloads: 0,
        armedAt: Date.now(),
        results: []
      },
      fireNow
    );
  }

  resume(state: ArmedState): Promise<void> {
    return this.start(state, false);
  }

  async stop(): Promise<void> {
    if (!this.abort) return;
    this.abort.abort();
    await this.clear();
    this.deps.emit({ type: 'stopped' });
  }

  private async start(state: ArmedState, fireNow: boolean): Promise<void> {
    this.abort?.abort();
    this.abort = new AbortController();
    this.state = state;
    this.isEphemeral = fireNow;
    await this.persist();
    this.deps.emit({
      type: 'armed',
      mode: state.mode,
      fireAtServerMs: fireNow ? this.deps.serverNow() : this.fireAtServerMs
    });
    void this.run(this.abort.signal);
  }

  private persist(): Promise<void> {
    return this.deps.persist(this.isEphemeral ? null : this.state);
  }

  private async clear(): Promise<void> {
    this.abort = null;
    this.state = null;
    await this.deps.persist(null);
  }

  private async run(signal: AbortSignal): Promise<void> {
    try {
      if (this.state?.phase === 'waiting') {
        if (!Number.isFinite(this.fireAtServerMs))
          throw new Error(t('set_opening_time'));
        await this.waitUntil(this.fireAtServerMs, signal);
        if (signal.aborted || !this.state) return;
        this.state = { ...this.state, phase: 'executing' };
        await this.persist();
      }
      await this.execute(signal);
    } catch (error) {
      if (signal.aborted) return;
      await this.fail(this.state?.stepIndex ?? 0, String(error));
    }
  }

  private async waitUntil(target: number, signal: AbortSignal): Promise<void> {
    const wait = this.deps.sleep ?? sleep;
    while (!signal.aborted) {
      const remaining = target - this.deps.serverNow();
      if (remaining <= 0) return;
      if (remaining > 2000) await wait(Math.min(remaining - 2000, 500));
      else if (remaining > 25) await wait(remaining - 25);
      else if (remaining > 4) await wait(0);
      else return this.spinUntil(target);
    }
  }

  private spinUntil(target: number): void {
    let guard = 0;
    while (this.deps.serverNow() < target && guard < 5_000_000) guard++;
  }

  private async execute(signal: AbortSignal): Promise<void> {
    const startIndex = this.state?.stepIndex ?? 0;
    for (let i = startIndex; i < this.task.steps.length; i++) {
      if (!this.state || signal.aborted) return;
      this.state = { ...this.state, stepIndex: i, phase: 'executing' };
      await this.persist();
      this.deps.emit({ type: 'step-start', stepIndex: i });
      const outcome = await this.runStep(i, signal);
      if (signal.aborted || outcome === 'reload' || !outcome || !this.state)
        return;
      this.state = {
        ...this.state,
        results: [...this.state.results, outcome]
      };
      if (outcome.isFinal) break;
    }
    const results = this.state?.results ?? [];
    await this.clear();
    this.deps.emit({ type: 'finished', results });
  }

  private checksFor(index: number): Checks {
    const step = this.task.steps[index];
    const next = this.task.steps[index + 1] ?? null;
    const successText = this.task.successText.trim();
    const expectText = step.expectText.trim();
    const checks: Checks = { expectText, successText, next };
    const ignore = (what: string) =>
      this.deps.emit({
        type: 'warning',
        stepIndex: index,
        reason: t('warn_already_present', index + 1, what)
      });
    if (successText && matchAnyText([successText]) !== null) {
      checks.successText = '';
      ignore(successText);
    }
    if (expectText && matchAnyText([expectText]) !== null) {
      checks.expectText = '';
      ignore(expectText);
    }
    if (next && readyTarget(next.target, true, this.task.neverClickText)) {
      checks.next = null;
      ignore(next.label || next.target.text);
    }
    return checks;
  }

  private satisfied(checks: Checks): Satisfied | null {
    const matched = matchAnyText([checks.successText, checks.expectText]);
    if (
      matched !== null &&
      checks.successText &&
      matched === checks.successText
    )
      return 'success';
    if (matched !== null) return 'expect';
    if (
      checks.next &&
      readyTarget(checks.next.target, true, this.task.neverClickText)
    )
      return 'next';
    return null;
  }

  private hasCheck(checks: Checks): boolean {
    return !!(checks.expectText || checks.successText || checks.next);
  }

  private done(
    result: StepResult,
    satisfiedBy: StepResult['satisfiedBy']
  ): StepResult {
    result.satisfiedBy = satisfiedBy;
    result.isFinal = satisfiedBy === 'success';
    this.deps.emit({ type: 'step-done', result });
    return result;
  }

  private async runStep(
    index: number,
    signal: AbortSignal
  ): Promise<StepResult | 'reload' | null> {
    const step = this.task.steps[index];
    const state = this.state;
    if (!state) return null;
    const isLive = state.mode === 'live';
    const isManual = state.mode === 'manual';
    const isDry = state.mode === 'dry';
    const canReload =
      !isDry &&
      index === 0 &&
      this.task.reload.isEnabled &&
      state.reloads < this.task.reload.maxReloads;
    const reloadWaitMs =
      state.reloads === 0
        ? this.task.reload.afterMs
        : this.task.reload.intervalMs;
    const timeoutMs = isDry
      ? DRY_TIMEOUT_MS
      : canReload
        ? reloadWaitMs
        : isManual
          ? Math.max(step.timeoutMs, MANUAL_WAIT_MS)
          : step.timeoutMs;
    let found: Resolved | null = await waitForTarget(step.target, {
      timeoutMs,
      requireEnabled: !isDry,
      neverClick: this.task.neverClickText,
      heartbeatMs: 30,
      signal
    });
    if (!found) {
      if (signal.aborted) return null;
      if (canReload) {
        this.state = { ...state, reloads: state.reloads + 1 };
        await this.deps.persist(this.state);
        this.deps.emit({ type: 'reloading', reloads: this.state.reloads });
        this.deps.reload();
        return 'reload';
      }
      if (isDry && index > 0) {
        return this.done(
          {
            stepIndex: index,
            clickedAtServerMs: this.deps.serverNow(),
            attempts: 0,
            via: 'text',
            isFinal: false,
            satisfiedBy: 'none'
          },
          'skipped'
        );
      }
      await this.fail(index, t('fail_not_found', step.label, timeoutMs));
      return null;
    }
    const wait = this.deps.sleep ?? sleep;
    const checks = this.checksFor(index);
    const hasCheck = this.hasCheck(checks);
    const isLast = index === this.task.steps.length - 1;
    const maxAttempts = isLast ? 1 : Math.max(1, step.maxAttempts);
    if (isLive && maxAttempts === 1) await this.deps.persist(null);
    if (isManual) return this.handOver(index, found, checks, signal);
    let attempts = 0;
    while (!signal.aborted) {
      attempts++;
      const clickedAtServerMs = this.deps.serverNow();
      if (isLive) {
        clickElement(found.el);
        this.deps.emit({
          type: 'click',
          stepIndex: index,
          attempt: attempts,
          atServerMs: clickedAtServerMs
        });
      } else {
        this.deps.highlight(found.el);
      }
      const result: StepResult = {
        stepIndex: index,
        clickedAtServerMs,
        attempts,
        via: found.via,
        isFinal: false,
        satisfiedBy: 'none'
      };
      if (!isLive || !hasCheck) return this.done(result, 'none');
      const outcome = await waitFor(() => this.satisfied(checks), {
        timeoutMs: step.settleMs,
        heartbeatMs: 30,
        signal
      });
      if (outcome) return this.done(result, outcome);
      if (signal.aborted) return null;
      if (attempts >= maxAttempts) {
        if (isLast) {
          this.deps.emit({
            type: 'warning',
            stepIndex: index,
            reason: t('warn_no_confirmation', index + 1, step.settleMs)
          });
          return this.done(result, 'unconfirmed');
        }
        await this.fail(index, t('fail_no_confirmation', attempts));
        return null;
      }
      await wait(step.retryIntervalMs);
      const again = await waitFor<Satisfied | Resolved>(
        () =>
          this.satisfied(checks) ??
          readyTarget(step.target, true, this.task.neverClickText),
        { timeoutMs: step.timeoutMs, heartbeatMs: 30, signal }
      );
      if (signal.aborted) return null;
      if (!again) {
        await this.fail(index, t('fail_button_gone', step.label));
        return null;
      }
      if (typeof again === 'string') return this.done(result, again);
      found = again;
    }
    return null;
  }

  private async handOver(
    index: number,
    found: Resolved,
    checks: Checks,
    signal: AbortSignal
  ): Promise<StepResult | null> {
    const shownAtServerMs = this.deps.serverNow();
    this.deps.handOver(found.el);
    const result: StepResult = {
      stepIndex: index,
      clickedAtServerMs: shownAtServerMs,
      attempts: 0,
      via: found.via,
      isFinal: false,
      satisfiedBy: 'none'
    };
    if (!this.hasCheck(checks)) {
      await this.fail(index, t('fail_manual_no_check'));
      return null;
    }
    const outcome = await waitFor(() => this.satisfied(checks), {
      timeoutMs: MANUAL_WAIT_MS,
      heartbeatMs: 50,
      signal
    });
    if (signal.aborted) return null;
    if (!outcome) {
      await this.fail(index, t('fail_manual_timeout'));
      return null;
    }
    return this.done(result, outcome);
  }

  private async fail(stepIndex: number, reason: string): Promise<void> {
    await this.clear();
    this.deps.emit({ type: 'failed', stepIndex, reason });
  }
}
