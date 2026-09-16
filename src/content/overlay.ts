import type { ClockSync, RunMode, Step, Task } from '../shared/models';
import { newStep } from '../shared/models';
import { isEnabled, isVisible, resolveTarget } from '../shared/dom';
import { LANGUAGES, getLanguage, t, type Language } from '../shared/i18n';
import {
  ZONE,
  formatClock,
  formatCountdown,
  formatDate,
  formatSigned,
  normalizeWallTime,
  wallTimeToEpoch
} from '../shared/time';
import { OVERLAY_CSS } from './overlay-css';

export interface OverlayCallbacks {
  now: () => number;
  onLanguageChange: (language: Language) => void;
  onTaskChange: (task: Task) => void;
  onArm: (mode: RunMode, isNow: boolean) => void;
  onStop: () => void;
  onSync: () => void;
  onPick: (stepIndex: number) => void;
}

export type ArmedBadge = { mode: RunMode } | { done: true } | null;

type Attrs = Record<string, string | boolean | EventListener>;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (typeof value === 'function')
      el.addEventListener(name.slice(2).toLowerCase(), value);
    else if (typeof value === 'boolean') {
      if (value) el.setAttribute(name, '');
    } else if (name === 'class') el.className = value;
    else el.setAttribute(name, value);
  }
  el.append(...children);
  return el;
}

export const HOST_ID = 'najbrzi-prst';
const LOG_KEY = 'najbrzi-prst:log';
const LIVE_CONFIRM_MS = 6000;
const LOG_LINES = 40;

export class Overlay {
  readonly host = h('div', { id: HOST_ID });
  readonly root = this.host.attachShadow({ mode: 'open' });
  private panel!: HTMLDivElement;
  private badge!: HTMLSpanElement;
  private pillClock!: HTMLSpanElement;
  private timeMain = document.createTextNode('');
  private timeMillis!: HTMLElement;
  private dateEl!: HTMLDivElement;
  private lastDateLine = '';
  private syncDot!: HTMLSpanElement;
  private syncText!: HTMLSpanElement;
  private syncBtn!: HTMLButtonElement;
  private countdownEl!: HTMLDivElement;
  private stepsEl!: HTMLDivElement;
  private logEl!: HTMLDivElement;
  private dryBtn!: HTMLButtonElement;
  private manualBtn!: HTMLButtonElement;
  private liveBtn!: HTMLButtonElement;
  private nowDryBtn!: HTMLButtonElement;
  private nowLiveBtn!: HTMLButtonElement;
  private stopBtn!: HTMLButtonElement;
  private fireAtMs = NaN;
  private liveConfirmTimer = 0;
  private stateTimer = 0;
  private lines: string[] = [];
  private lastSync: ClockSync | null = null;
  private isSyncing = false;
  private lastArmed: ArmedBadge = null;

  constructor(
    private task: Task,
    private readonly callbacks: OverlayCallbacks
  ) {
    this.root.append(h('style', {}, [OVERLAY_CSS]));
    this.build();
    this.restoreLog();
    this.updateFireAt();
  }

  mount(): void {
    if (!this.host.isConnected) document.documentElement.append(this.host);
    this.stateTimer = window.setInterval(() => this.refreshStepStates(), 700);
  }

  get isOpen(): boolean {
    return !this.panel.classList.contains('collapsed');
  }

  setOpen(isOpen: boolean): void {
    this.panel.classList.toggle('collapsed', !isOpen);
    this.task.isPanelOpen = isOpen;
    this.callbacks.onTaskChange(this.task);
  }

  setTask(task: Task): void {
    this.task = task;
    this.renderSteps();
    this.updateFireAt();
  }

  get fireAt(): number {
    return this.fireAtMs;
  }

  rebuild(): void {
    const wasOpen = this.isOpen;
    this.panel.remove();
    this.lastDateLine = '';
    this.build();
    this.panel.classList.toggle('collapsed', !wasOpen);
    this.renderLog();
    this.setClock(this.lastSync, this.isSyncing);
    this.setArmed(this.lastArmed);
  }

  setClock(sync: ClockSync | null, isSyncing: boolean): void {
    this.lastSync = sync;
    this.isSyncing = isSyncing;
    this.syncBtn.disabled = isSyncing;
    this.syncBtn.textContent = isSyncing ? t('sync_busy') : t('sync_button');
    if (!sync) {
      this.syncDot.className = 'dot';
      this.syncText.textContent = t('sync_none');
      return;
    }
    const quality =
      sync.uncertaintyMs <= 100
        ? 'good'
        : sync.uncertaintyMs <= 600
          ? 'fair'
          : '';
    this.syncDot.className = `dot ${quality}`;
    this.syncText.textContent = t(
      'sync_status',
      formatSigned(-sync.offsetMs),
      (sync.uncertaintyMs / 1000).toFixed(3),
      sync.rttMs
    );
  }

  tick(serverNowMs: number): void {
    const clock = formatClock(serverNowMs);
    this.timeMain.data = clock.slice(0, 8);
    this.timeMillis.textContent = clock.slice(8);
    const dateLine = t('clock_meta', formatDate(serverNowMs), location.host);
    if (dateLine !== this.lastDateLine) {
      this.lastDateLine = dateLine;
      this.dateEl.textContent = dateLine;
    }
    if (Number.isNaN(this.fireAtMs)) {
      this.countdownEl.className = 'countdown unset';
      this.countdownEl.textContent = t('countdown_unset');
      this.pillClock.textContent = clock.slice(0, 8);
      return;
    }
    const remaining = this.fireAtMs - serverNowMs;
    this.countdownEl.className = remaining < 0 ? 'countdown past' : 'countdown';
    const text = formatCountdown(remaining);
    this.countdownEl.textContent = text;
    this.pillClock.textContent = text.slice(0, 11);
  }

  setArmed(state: ArmedBadge): void {
    this.lastArmed = state;
    const isArmed = !!state && 'mode' in state;
    this.badge.className = 'badge';
    if (!state) this.badge.textContent = t('badge_idle');
    else if ('done' in state) {
      this.badge.classList.add('done');
      this.badge.textContent = t('badge_done');
    } else {
      this.badge.classList.add(state.mode);
      this.badge.textContent = t(
        state.mode === 'live'
          ? 'badge_live'
          : state.mode === 'manual'
            ? 'badge_manual'
            : 'badge_dry'
      );
    }
    for (const btn of [
      this.dryBtn,
      this.manualBtn,
      this.liveBtn,
      this.nowDryBtn,
      this.nowLiveBtn
    ])
      btn.disabled = isArmed;
    this.stopBtn.disabled = !isArmed;
    this.resetLiveConfirm();
  }

  log(line: string, kind: 'ok' | 'bad' | 'warn' | '' = ''): void {
    const stamp = formatClock(this.callbacks.now());
    const entry = `${stamp} ${line}`;
    this.lines.push(kind ? `${kind}|${entry}` : entry);
    this.lines = this.lines.slice(-LOG_LINES);
    try {
      sessionStorage.setItem(LOG_KEY, JSON.stringify(this.lines));
    } catch {
      this.lines = this.lines.slice(-LOG_LINES);
    }
    this.renderLog();
  }

  flash(el: HTMLElement): void {
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    const box = h('div', { class: 'flash' });
    box.style.left = `${r.left - 4}px`;
    box.style.top = `${r.top - 4}px`;
    box.style.width = `${r.width + 8}px`;
    box.style.height = `${r.height + 8}px`;
    this.root.append(box);
    setTimeout(() => box.remove(), 1300);
  }

  private build(): void {
    this.badge = h('span', { class: 'badge' }, [t('badge_idle')]);
    this.pillClock = h('span', { class: 'pill' });
    const collapse = h(
      'button',
      {
        class: 'icon-btn',
        title: t('collapse_title'),
        onClick: () => this.setOpen(!this.isOpen)
      },
      ['▾']
    );
    const language = h('select', {
      class: 'lang',
      title: t('language_label'),
      onChange: () =>
        this.callbacks.onLanguageChange(language.value as Language)
    });
    for (const code of LANGUAGES) {
      const option = h('option', { value: code }, [code.toUpperCase()]);
      option.selected = code === getLanguage();
      language.append(option);
    }
    const head = h('div', { class: 'head' }, [
      h('span', { class: 'title' }, [t('panel_title')]),
      this.pillClock,
      this.badge,
      language,
      collapse
    ]);

    this.timeMillis = h('small');
    const timeEl = h('div', { class: 'time' }, [
      this.timeMain,
      this.timeMillis
    ]);
    this.dateEl = h('div', { class: 'meta' });
    this.syncDot = h('span', { class: 'dot' });
    this.syncText = h('span', {}, [t('sync_none')]);
    this.syncBtn = h(
      'button',
      { class: 'btn', onClick: () => this.callbacks.onSync() },
      [t('sync_button')]
    );
    this.countdownEl = h('div', { class: 'countdown unset' });
    const clock = h('div', { class: 'clock' }, [
      timeEl,
      this.dateEl,
      h('div', { class: 'sync' }, [this.syncDot, this.syncText, this.syncBtn]),
      this.countdownEl
    ]);

    const [datePart, timePart] = (
      normalizeWallTime(this.task.openingWallTime) || 'T'
    ).split('T');
    const dateInput = h('input', { type: 'date', value: datePart });
    const timeInput = h('input', { type: 'time', step: '1', value: timePart });
    const onOpening = () => {
      this.task.openingWallTime =
        dateInput.value && timeInput.value
          ? `${dateInput.value}T${timeInput.value}`
          : '';
      this.updateFireAt();
      this.callbacks.onTaskChange(this.task);
    };
    dateInput.addEventListener('change', onOpening);
    timeInput.addEventListener('change', onOpening);
    const leadInput = this.numberInput(
      this.task.leadMs,
      value => (this.task.leadMs = value)
    );
    const reloadOn = h('input', { type: 'checkbox' });
    reloadOn.checked = this.task.reload.isEnabled;
    reloadOn.addEventListener('change', () => {
      this.task.reload.isEnabled = reloadOn.checked;
      this.callbacks.onTaskChange(this.task);
    });
    const reloadAfter = this.numberInput(
      this.task.reload.afterMs,
      value => (this.task.reload.afterMs = Math.max(0, value))
    );
    const reloadEvery = this.numberInput(
      this.task.reload.intervalMs,
      value => (this.task.reload.intervalMs = Math.max(500, value))
    );
    const reloadMax = this.numberInput(
      this.task.reload.maxReloads,
      value => (this.task.reload.maxReloads = Math.max(0, value))
    );
    const timing = h('div', { class: 'section' }, [
      h('h4', {}, [t('timing_heading', ZONE)]),
      h('div', { class: 'row' }, [
        dateInput,
        timeInput,
        h('label', {}, [t('timing_offset')]),
        leadInput,
        h('label', {}, [t('ms')])
      ]),
      h('div', { class: 'row' }, [
        reloadOn,
        h('label', {}, [t('reload_label')]),
        reloadAfter,
        h('label', {}, [t('reload_then')]),
        reloadEvery,
        h('label', {}, [t('reload_max')]),
        reloadMax,
        h('label', {}, [t('reload_times')])
      ]),
      h('div', { class: 'hint' }, [t('timing_hint')])
    ]);

    this.stepsEl = h('div', { class: 'section' });
    const addStep = h(
      'button',
      { class: 'btn', onClick: () => this.addStep() },
      [t('add_step')]
    );
    const successInput = this.textInput(
      this.task.successText,
      value => (this.task.successText = value)
    );
    const neverClickInput = this.textInput(
      this.task.neverClickText,
      value => (this.task.neverClickText = value)
    );
    const alertInput = this.textInput(
      this.task.alertText,
      value => (this.task.alertText = value)
    );
    const steps = h('div', { class: 'section' }, [
      h('h4', {}, [t('steps_heading')]),
      this.stepsEl,
      addStep,
      h('div', { class: 'row' }, [
        h('label', {}, [t('success_text_label')]),
        successInput
      ]),
      h('div', { class: 'hint' }, [t('steps_hint')]),
      h('details', {}, [
        h('summary', {}, [t('safety_heading')]),
        h('div', { class: 'row' }, [
          h('label', {}, [t('never_click_label')]),
          neverClickInput
        ]),
        h('div', { class: 'row' }, [
          h('label', {}, [t('alert_text_label')]),
          alertInput
        ]),
        h('div', { class: 'hint' }, [t('safety_hint')])
      ])
    ]);

    this.dryBtn = h(
      'button',
      {
        class: 'btn primary',
        onClick: () => this.callbacks.onArm('dry', false)
      },
      [t('arm_dry')]
    );
    this.liveBtn = h(
      'button',
      { class: 'btn danger', onClick: () => this.confirmLive(false) },
      [t('arm_live')]
    );
    this.manualBtn = h(
      'button',
      {
        class: 'btn primary',
        onClick: () => this.callbacks.onArm('manual', false)
      },
      [t('arm_manual')]
    );
    this.nowDryBtn = h(
      'button',
      { class: 'btn', onClick: () => this.callbacks.onArm('dry', true) },
      [t('now_dry')]
    );
    this.nowLiveBtn = h(
      'button',
      { class: 'btn warn', onClick: () => this.confirmLive(true) },
      [t('now_live')]
    );
    this.stopBtn = h(
      'button',
      {
        class: 'btn stop',
        disabled: true,
        onClick: () => this.callbacks.onStop()
      },
      [t('stop')]
    );
    const actions = h('div', { class: 'section' }, [
      this.manualBtn,
      h('div', { class: 'actions' }, [
        this.nowDryBtn,
        this.dryBtn,
        this.nowLiveBtn,
        this.liveBtn
      ]),
      this.stopBtn,
      h('div', { class: 'hint' }, [t('actions_hint')])
    ]);

    this.logEl = h('div', { class: 'log' });
    const body = h('div', { class: 'body' }, [
      clock,
      timing,
      steps,
      actions,
      this.logEl
    ]);
    this.panel = h(
      'div',
      { class: `panel${this.task.isPanelOpen ? '' : ' collapsed'}` },
      [head, body]
    );
    this.root.append(this.panel);
    this.renderSteps();
  }

  private numberInput(
    value: number,
    apply: (value: number) => void
  ): HTMLInputElement {
    const input = h('input', { type: 'number', value: String(value) });
    input.addEventListener('change', () => {
      const parsed = Number(input.value);
      if (Number.isFinite(parsed)) apply(parsed);
      input.value = String(Number.isFinite(parsed) ? parsed : value);
      this.callbacks.onTaskChange(this.task);
    });
    return input;
  }

  private textInput(
    value: string,
    apply: (value: string) => void
  ): HTMLInputElement {
    const input = h('input', { type: 'text', value });
    input.addEventListener('change', () => {
      apply(input.value);
      this.callbacks.onTaskChange(this.task);
    });
    return input;
  }

  private renderSteps(): void {
    this.stepsEl.replaceChildren(
      ...this.task.steps.map((step, index) => this.stepRow(step, index))
    );
    this.refreshStepStates();
  }

  private stepRow(step: Step, index: number): HTMLElement {
    const label = this.textInput(step.label, value => (step.label = value));
    const targetText = this.textInput(
      step.target.text,
      value => (step.target.text = value)
    );
    const pick = h(
      'button',
      { class: 'btn primary', onClick: () => this.callbacks.onPick(index) },
      [t('pick_button')]
    );
    const test = h(
      'button',
      { class: 'btn', onClick: () => this.testStep(index) },
      [t('show_button')]
    );
    const remove = h(
      'button',
      {
        class: 'btn',
        title: t('remove_step_title'),
        onClick: () => this.removeStep(index)
      },
      ['×']
    );
    const target = h('div', { class: 'target' });
    const state = h('div', { class: 'state' });
    target.dataset.stepIndex = String(index);
    state.dataset.stepIndex = String(index);
    const expect = this.textInput(
      step.expectText,
      value => (step.expectText = value)
    );
    const attempts = this.numberInput(
      step.maxAttempts,
      value => (step.maxAttempts = Math.max(1, value))
    );
    const retry = this.numberInput(
      step.retryIntervalMs,
      value => (step.retryIntervalMs = Math.max(0, value))
    );
    const settle = this.numberInput(
      step.settleMs,
      value => (step.settleMs = Math.max(100, value))
    );
    const timeout = this.numberInput(
      step.timeoutMs,
      value => (step.timeoutMs = Math.max(500, value))
    );
    const advanced = h('details', {}, [
      h('summary', {}, [t('advanced')]),
      h('div', { class: 'row' }, [h('label', {}, [t('expect_label')]), expect]),
      h('div', { class: 'row' }, [
        h('label', {}, [t('max_clicks')]),
        attempts,
        h('label', {}, [t('retry_gap')]),
        retry,
        h('label', {}, [t('ms')]),
        h('label', {}, [t('wait_text')]),
        settle,
        h('label', {}, [t('ms')]),
        h('label', {}, [t('wait_button')]),
        timeout,
        h('label', {}, [t('ms')])
      ]),
      h('div', { class: 'hint' }, [t('advanced_hint')])
    ]);
    return h('div', { class: 'step' }, [
      h('div', { class: 'row' }, [
        h('span', { class: 'num' }, [`${index + 1}.`]),
        label,
        pick,
        test,
        remove
      ]),
      h('div', { class: 'row' }, [
        h('label', {}, [t('button_text_label')]),
        targetText
      ]),
      target,
      state,
      advanced
    ]);
  }

  private describe(step: Step): string {
    if (!step.target.selector && !step.target.text)
      return t('no_button_picked');
    const selector = step.target.selector
      ? ` · ${step.target.selector}`
      : ` · ${t('by_text')}`;
    return `${step.target.tag || 'button'} „${step.target.text}"${selector}`;
  }

  refreshStepStates(): void {
    const targets = this.stepsEl.querySelectorAll<HTMLElement>('.target');
    const states = this.stepsEl.querySelectorAll<HTMLElement>('.state');
    this.task.steps.forEach((step, index) => {
      const target = targets[index];
      const state = states[index];
      if (!target || !state) return;
      target.replaceChildren(
        t('target_prefix'),
        h('b', {}, [this.describe(step)])
      );
      const found = resolveTarget(
        step.target,
        document,
        this.task.neverClickText
      );
      if (!found) {
        state.className = 'state missing';
        state.textContent = t(
          index === 0 ? 'state_missing_first' : 'state_missing_later'
        );
        return;
      }
      const isShown = isVisible(found.el);
      const isReady = isShown && isEnabled(found.el);
      const via = t(found.via === 'selector' ? 'via_selector' : 'via_text');
      state.className = isReady
        ? 'state ok'
        : isShown
          ? 'state off'
          : 'state missing';
      state.textContent = isReady
        ? t('state_ready', via)
        : isShown
          ? t('state_disabled', via)
          : t('state_hidden', via);
    });
  }

  private testStep(index: number): void {
    const step = this.task.steps[index];
    const found = resolveTarget(
      step.target,
      document,
      this.task.neverClickText
    );
    if (!found) {
      this.log(t('test_not_found', index + 1), 'warn');
      return;
    }
    this.flash(found.el);
    this.log(
      t(
        'test_found',
        index + 1,
        found.el.tagName.toLowerCase(),
        (found.el.textContent ?? '').trim(),
        t(found.via === 'selector' ? 'via_selector' : 'via_text'),
        t(isEnabled(found.el) ? 'enabled' : 'disabled')
      )
    );
  }

  private addStep(): void {
    this.task.steps.push(
      newStep(t('step_default_label', this.task.steps.length + 1), '')
    );
    this.renderSteps();
    this.callbacks.onTaskChange(this.task);
  }

  private removeStep(index: number): void {
    if (this.task.steps.length === 1) {
      this.log(t('keep_one_step'), 'warn');
      return;
    }
    this.task.steps.splice(index, 1);
    this.renderSteps();
    this.callbacks.onTaskChange(this.task);
  }

  private confirmLive(isNow: boolean): void {
    const btn = isNow ? this.nowLiveBtn : this.liveBtn;
    if (btn.dataset.confirm === '1') {
      this.resetLiveConfirm();
      this.callbacks.onArm('live', isNow);
      return;
    }
    this.resetLiveConfirm();
    btn.dataset.confirm = '1';
    btn.textContent = t(isNow ? 'confirm_live_now' : 'confirm_live');
    this.liveConfirmTimer = window.setTimeout(
      () => this.resetLiveConfirm(),
      LIVE_CONFIRM_MS
    );
  }

  private resetLiveConfirm(): void {
    clearTimeout(this.liveConfirmTimer);
    delete this.liveBtn.dataset.confirm;
    delete this.nowLiveBtn.dataset.confirm;
    this.liveBtn.textContent = t('arm_live');
    this.nowLiveBtn.textContent = t('now_live');
  }

  private updateFireAt(): void {
    const opening = wallTimeToEpoch(this.task.openingWallTime);
    this.fireAtMs = Number.isNaN(opening) ? NaN : opening + this.task.leadMs;
  }

  private restoreLog(): void {
    try {
      this.lines = JSON.parse(
        sessionStorage.getItem(LOG_KEY) ?? '[]'
      ) as string[];
    } catch {
      this.lines = [];
    }
    this.renderLog();
  }

  private renderLog(): void {
    this.logEl.replaceChildren(
      ...this.lines.map(raw => {
        const [kind, text] = /^(ok|bad|warn)\|/.test(raw)
          ? raw.split(/\|(.+)/)
          : ['', raw];
        return h('div', { class: kind }, [text]);
      })
    );
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  destroy(): void {
    clearInterval(this.stateTimer);
    this.host.remove();
  }
}
