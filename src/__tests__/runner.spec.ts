import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Runner, type RunnerDeps } from '../content/runner';
import { defaultTask } from '../shared/models';
import type { RunnerEvent, Task } from '../shared/models';
import { mockLayout } from './__mocks__/layout';

beforeAll(mockLayout);

function page(): void {
  document.body.innerHTML = `
    <button id="submit" class="ant-btn ant-btn-primary" disabled><span>Podnesi prijavu</span></button>
    <div id="modal" hidden>
      <p>Jeste li sigurni da želite podnijeti prijavu?</p>
      <button id="confirm"><span>Da, podnesi prijavu</span></button>
    </div>
    <div id="result"></div>`;
  const submit = document.getElementById('submit')!;
  const modal = document.getElementById('modal')!;
  submit.addEventListener('click', () => {
    if (!submit.hasAttribute('disabled')) modal.hidden = false;
  });
  document.getElementById('confirm')!.addEventListener('click', () => {
    modal.hidden = true;
    document.getElementById('result')!.textContent =
      'Prijava uspješno podnesena';
  });
}

function fastTask(): Task {
  const task = defaultTask('efzoeu.gov.hr');
  task.reload.isEnabled = false;
  task.steps[0].settleMs = 200;
  task.steps[0].retryIntervalMs = 20;
  task.steps[0].maxAttempts = 3;
  task.steps[1].settleMs = 300;
  task.steps[1].timeoutMs = 500;
  return task;
}

function deps(overrides: Partial<RunnerDeps> = {}) {
  const events: RunnerEvent[] = [];
  const base: RunnerDeps = {
    serverNow: () => Date.now(),
    reload: vi.fn(),
    persist: vi.fn(async () => {}),
    emit: event => events.push(event),
    highlight: vi.fn(),
    handOver: vi.fn(),
    ...overrides
  };
  return { deps: base, events };
}

const finished = (events: RunnerEvent[]) =>
  new Promise<void>(resolve => {
    const tick = () => {
      if (
        events.some(
          e =>
            e.type === 'finished' || e.type === 'failed' || e.type === 'stopped'
        )
      )
        resolve();
      else setTimeout(tick, 5);
    };
    tick();
  });

describe('Runner', () => {
  beforeEach(page);

  it('waits for the fire time, clicks both steps and finishes', async () => {
    const { deps: d, events } = deps();
    const fireAt = Date.now() + 80;
    setTimeout(
      () => document.getElementById('submit')!.removeAttribute('disabled'),
      60
    );
    const runner = new Runner(fastTask(), fireAt, d);
    await runner.arm('live');
    await finished(events);
    const done = events.find(e => e.type === 'finished');
    expect(done).toBeDefined();
    expect(document.getElementById('result')!.textContent).toBe(
      'Prijava uspješno podnesena'
    );
    const first = events.find(e => e.type === 'step-done');
    expect(
      first && first.type === 'step-done' && first.result.clickedAtServerMs
    ).toBeGreaterThanOrEqual(fireAt);
    expect(d.persist).toHaveBeenLastCalledWith(null);
  });

  it('retries the first click until the expected text appears', async () => {
    const { deps: d, events } = deps();
    const submit = document.getElementById('submit')!;
    submit.removeAttribute('disabled');
    let clicks = 0;
    const modal = document.getElementById('modal')!;
    modal.hidden = true;
    submit.replaceWith(submit.cloneNode(true));
    document.getElementById('submit')!.addEventListener('click', () => {
      clicks++;
      if (clicks === 2) modal.hidden = false;
    });
    const runner = new Runner(fastTask(), Date.now(), d);
    await runner.arm('live');
    await finished(events);
    expect(clicks).toBe(2);
    expect(events.at(-1)?.type).toBe('finished');
  });

  it('fails after maxAttempts without the expected text', async () => {
    const { deps: d, events } = deps();
    const submit = document.getElementById('submit')!;
    submit.removeAttribute('disabled');
    submit.replaceWith(submit.cloneNode(true));
    const runner = new Runner(fastTask(), Date.now(), d);
    await runner.arm('live');
    await finished(events);
    const failed = events.find(e => e.type === 'failed');
    expect(failed && failed.type === 'failed' && failed.stepIndex).toBe(0);
  });

  it('reloads when the first button stays disabled and resumes after reload', async () => {
    const { deps: d, events } = deps();
    const task = fastTask();
    task.reload = {
      isEnabled: true,
      afterMs: 30,
      intervalMs: 30,
      maxReloads: 2
    };
    const runner = new Runner(task, Date.now(), d);
    await runner.arm('live');
    await new Promise(resolve => setTimeout(resolve, 120));
    expect(d.reload).toHaveBeenCalledTimes(1);
    expect(events.some(e => e.type === 'reloading')).toBe(true);
    expect(d.persist).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'executing', reloads: 1 })
    );
  });

  it('dry run highlights instead of clicking, never reloads and skips buttons that appear only after a click', async () => {
    const { deps: d, events } = deps();
    const task = fastTask();
    task.reload.isEnabled = true;
    const runner = new Runner(task, Date.now(), d);
    await runner.arm('dry');
    await finished(events);
    expect(d.highlight).toHaveBeenCalledTimes(1);
    expect(d.reload).not.toHaveBeenCalled();
    expect(document.getElementById('modal')!.hidden).toBe(true);
    const done = events.at(-1);
    expect(done?.type).toBe('finished');
    expect(
      done && done.type === 'finished' && done.results.map(r => r.satisfiedBy)
    ).toEqual(['none', 'skipped']);
  });

  it('clicks the last step only once even when maxAttempts allows more', async () => {
    const { deps: d, events } = deps();
    const task = fastTask();
    task.steps[1].maxAttempts = 5;
    task.steps[1].retryIntervalMs = 10;
    document.getElementById('submit')!.removeAttribute('disabled');
    const confirm = document.getElementById('confirm')!;
    confirm.replaceWith(confirm.cloneNode(true));
    let confirmClicks = 0;
    document
      .getElementById('confirm')!
      .addEventListener('click', () => confirmClicks++);
    const runner = new Runner(task, Date.now(), d);
    await runner.arm('live');
    await finished(events);
    expect(confirmClicks).toBe(1);
    expect(events.at(-1)?.type).toBe('finished');
    const warning = events.find(e => e.type === 'warning');
    expect(warning && warning.type === 'warning' && warning.stepIndex).toBe(1);
  });

  it('finishes a single step with a warning when nothing confirms the click', async () => {
    const { deps: d, events } = deps();
    const task = fastTask();
    task.steps = [task.steps[0]];
    task.steps[0].settleMs = 100;
    const submit = document.getElementById('submit')!;
    submit.removeAttribute('disabled');
    submit.replaceWith(submit.cloneNode(true));
    const runner = new Runner(task, Date.now(), d);
    await runner.arm('live');
    await finished(events);
    expect(events.filter(e => e.type === 'click')).toHaveLength(1);
    expect(events.some(e => e.type === 'warning')).toBe(true);
    const done = events.at(-1);
    expect(done?.type).toBe('finished');
    expect(
      done && done.type === 'finished' && done.results[0].satisfiedBy
    ).toBe('unconfirmed');
  });

  it('retries against a fresh ready target instead of the stale element', async () => {
    const { deps: d, events } = deps();
    const submit = document.getElementById('submit')!;
    submit.removeAttribute('disabled');
    submit.replaceWith(submit.cloneNode(true));
    const fresh = document.getElementById('submit')!;
    const modal = document.getElementById('modal')!;
    let clicks = 0;
    fresh.addEventListener('click', () => {
      if (fresh.hasAttribute('disabled')) return;
      clicks++;
      if (clicks === 1) {
        fresh.setAttribute('disabled', '');
        setTimeout(() => fresh.removeAttribute('disabled'), 300);
        return;
      }
      modal.hidden = false;
    });
    const runner = new Runner(fastTask(), Date.now(), d);
    await runner.arm('live');
    await finished(events);
    expect(clicks).toBe(2);
    expect(events.at(-1)?.type).toBe('finished');
    const firstStepClicks = events.filter(
      e => e.type === 'click' && e.stepIndex === 0
    );
    expect(firstStepClicks).toHaveLength(2);
  });

  it('fails when the button disappears after the click and nothing confirms', async () => {
    const { deps: d, events } = deps();
    const task = fastTask();
    task.steps[0].timeoutMs = 200;
    const submit = document.getElementById('submit')!;
    submit.removeAttribute('disabled');
    submit.replaceWith(submit.cloneNode(true));
    document
      .getElementById('submit')!
      .addEventListener('click', event =>
        (event.currentTarget as HTMLElement).remove()
      );
    const runner = new Runner(task, Date.now(), d);
    await runner.arm('live');
    await finished(events);
    const failed = events.find(e => e.type === 'failed');
    expect(failed && failed.type === 'failed' && failed.stepIndex).toBe(0);
    expect(events.filter(e => e.type === 'click')).toHaveLength(1);
  });

  it('manual mode reloads when the first button stays disabled', async () => {
    const { deps: d, events } = deps();
    const task = fastTask();
    task.reload = {
      isEnabled: true,
      afterMs: 30,
      intervalMs: 30,
      maxReloads: 2
    };
    const runner = new Runner(task, Date.now(), d);
    await runner.arm('manual');
    await new Promise(resolve => setTimeout(resolve, 120));
    expect(d.reload).toHaveBeenCalledTimes(1);
    expect(events.some(e => e.type === 'reloading')).toBe(true);
    expect(d.handOver).not.toHaveBeenCalled();
  });

  it('resumes an executing state after a reload and finishes the remaining steps', async () => {
    const { deps: d, events } = deps();
    document.getElementById('submit')!.removeAttribute('disabled');
    const runner = new Runner(fastTask(), Date.now() - 2000, d);
    await runner.resume({
      mode: 'live',
      phase: 'executing',
      stepIndex: 0,
      reloads: 1,
      armedAt: Date.now(),
      results: []
    });
    await finished(events);
    expect(events.at(-1)?.type).toBe('finished');
    expect(document.getElementById('result')!.textContent).toBe(
      'Prijava uspješno podnesena'
    );
  });

  it('resumes a waiting state and fires at the stored time', async () => {
    const { deps: d, events } = deps();
    setTimeout(
      () => document.getElementById('submit')!.removeAttribute('disabled'),
      20
    );
    const runner = new Runner(fastTask(), Date.now() + 60, d);
    await runner.resume({
      mode: 'live',
      phase: 'waiting',
      stepIndex: 0,
      reloads: 0,
      armedAt: Date.now(),
      results: []
    });
    await finished(events);
    expect(events.at(-1)?.type).toBe('finished');
  });

  it('clears the persisted state before clicking the final confirm', async () => {
    let lastPersisted: unknown = 'unset';
    let persistedAtConfirm: unknown = 'unset';
    const { deps: d, events } = deps({
      persist: vi.fn(async state => {
        lastPersisted = state;
      })
    });
    document.getElementById('submit')!.removeAttribute('disabled');
    document.getElementById('confirm')!.addEventListener('click', () => {
      persistedAtConfirm = lastPersisted;
    });
    const runner = new Runner(fastTask(), Date.now(), d);
    await runner.arm('live');
    await finished(events);
    expect(events.at(-1)?.type).toBe('finished');
    expect(persistedAtConfirm).toBeNull();
  });

  it('finishes after the first click when the success text appears without a confirm dialog', async () => {
    const { deps: d, events } = deps();
    const submit = document.getElementById('submit')!;
    submit.removeAttribute('disabled');
    submit.replaceWith(submit.cloneNode(true));
    document.getElementById('submit')!.addEventListener('click', () => {
      document.getElementById('result')!.textContent =
        'Prijava uspješno podnesena';
    });
    const runner = new Runner(fastTask(), Date.now(), d);
    await runner.arm('live');
    await finished(events);
    const done = events.at(-1);
    expect(done?.type).toBe('finished');
    expect(done && done.type === 'finished' && done.results).toHaveLength(1);
    expect(
      done && done.type === 'finished' && done.results[0].satisfiedBy
    ).toBe('success');
  });

  it('treats the next button appearing as confirmation even when the expected text differs', async () => {
    const { deps: d, events } = deps();
    const task = fastTask();
    task.steps[0].expectText = 'Neki drugi tekst';
    document.getElementById('submit')!.removeAttribute('disabled');
    const runner = new Runner(task, Date.now(), d);
    await runner.arm('live');
    await finished(events);
    expect(events.at(-1)?.type).toBe('finished');
    const first = events.find(e => e.type === 'step-done');
    expect(
      first && first.type === 'step-done' && first.result.satisfiedBy
    ).toBe('next');
  });

  it('manual mode hands the button to the human and finishes once the human clicks through', async () => {
    const { deps: d, events } = deps();
    setTimeout(
      () => document.getElementById('submit')!.removeAttribute('disabled'),
      20
    );
    setTimeout(() => document.getElementById('submit')!.click(), 80);
    setTimeout(() => document.getElementById('confirm')!.click(), 160);
    const runner = new Runner(fastTask(), Date.now(), d);
    await runner.arm('manual');
    await finished(events);
    expect(d.handOver).toHaveBeenCalledTimes(2);
    expect(events.at(-1)?.type).toBe('finished');
    expect(document.getElementById('result')!.textContent).toBe(
      'Prijava uspješno podnesena'
    );
  });

  it('ignores confirmation text that was already on the page before the click', async () => {
    const { deps: d, events } = deps();
    const task = fastTask();
    task.steps[0].timeoutMs = 300;
    document.body.insertAdjacentHTML(
      'beforeend',
      '<p id="help">Jeste li sigurni? Prijava uspješno podnesena.</p>'
    );
    const submit = document.getElementById('submit')!;
    submit.removeAttribute('disabled');
    submit.replaceWith(submit.cloneNode(true));
    const runner = new Runner(task, Date.now(), d);
    await runner.arm('live');
    await finished(events);
    const warnings = events.filter(e => e.type === 'warning');
    expect(warnings).toHaveLength(2);
    const failed = events.find(e => e.type === 'failed');
    expect(failed && failed.type === 'failed' && failed.stepIndex).toBe(0);
  });

  it('manual mode fails fast when nothing can confirm the click', async () => {
    const { deps: d, events } = deps();
    const task = fastTask();
    task.steps = [task.steps[0]];
    task.steps[0].expectText = '';
    task.successText = '';
    document.getElementById('submit')!.removeAttribute('disabled');
    const runner = new Runner(task, Date.now(), d);
    await runner.arm('manual');
    await finished(events);
    expect(d.handOver).toHaveBeenCalledTimes(1);
    expect(events.at(-1)?.type).toBe('failed');
  });

  it('stop aborts a waiting runner', async () => {
    const { deps: d, events } = deps();
    const runner = new Runner(fastTask(), Date.now() + 10_000, d);
    await runner.arm('live');
    expect(runner.isArmed).toBe(true);
    await runner.stop();
    expect(runner.isArmed).toBe(false);
    expect(d.persist).toHaveBeenLastCalledWith(null);
    expect(events.at(-1)?.type).toBe('stopped');
  });
});
