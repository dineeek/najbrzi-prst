import type { RunMode, RunnerEvent, StepResult, Task } from '../shared/models';
import {
  isLanguageChange,
  loadArmed,
  loadClock,
  loadLanguage,
  saveArmed,
  saveClock,
  saveLanguage,
  saveTask,
  loadTask
} from '../shared/storage';
import type {
  BackgroundMessage,
  PanelStateReply,
  PopupMessage
} from '../shared/messages';
import { describeTarget } from '../shared/selector';
import { formatClock } from '../shared/time';
import { matchAnyText } from '../shared/dom';
import { resumeVerdict } from '../shared/resume';
import { isDefaultStepLabel, setLanguage, t } from '../shared/i18n';
import { ServerClock, originProbe } from './clock';
import { Overlay } from './overlay';
import { pickElement } from './picker';
import { Runner } from './runner';

declare global {
  interface Window {
    __najbrziPrst?: boolean;
  }
}

const origin = location.origin;
const RESYNC_MS = 5 * 60 * 1000;
const FINAL_RESYNC_BEFORE_MS = 40 * 1000;
const COARSE_SYNC_MS = 300;

function bodyReady(): Promise<void> {
  return new Promise(resolve => {
    if (document.body) return resolve();
    const observer = new MutationObserver(() => {
      if (document.body) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(document.documentElement, { childList: true });
  });
}

function send(message: BackgroundMessage): boolean {
  try {
    void chrome.runtime.sendMessage(message).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

let audio: AudioContext | null = null;

function localBeep(times: number): void {
  try {
    audio ??= new AudioContext();
    void audio.resume();
    for (let i = 0; i < times; i++) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.15;
      osc.connect(gain).connect(audio.destination);
      osc.start(audio.currentTime + i * 0.25);
      osc.stop(audio.currentTime + i * 0.25 + 0.15);
    }
  } catch {
    return;
  }
}

function modeName(mode: RunMode): string {
  return t(
    mode === 'live'
      ? 'mode_live'
      : mode === 'manual'
        ? 'mode_manual'
        : 'mode_dry'
  );
}

function howSatisfied(result: StepResult): string {
  switch (result.satisfiedBy) {
    case 'success':
      return t('how_success');
    case 'next':
      return t('how_next');
    case 'expect':
      return t('how_expect');
    case 'skipped':
      return t('how_skipped');
    case 'unconfirmed':
      return t('how_unconfirmed');
    default:
      return t('how_none');
  }
}

async function main(): Promise<void> {
  await bodyReady();
  setLanguage(await loadLanguage());
  let task: Task = await loadTask(origin);
  const clock = new ServerClock(origin, originProbe(origin, location.pathname));
  const storedSync = await loadClock(origin);
  if (storedSync && Date.now() - storedSync.syncedAt < RESYNC_MS)
    clock.sync = storedSync;
  let runner: Runner | null = null;
  let resyncTimer = 0;
  let finalResyncTimer = 0;
  let isReloading = false;
  let isArming = false;
  let pendingResync: Promise<boolean> | null = null;

  const beep = (times: number) => {
    if (!task.isSoundOn) return;
    if (!send({ type: 'beep', times })) localBeep(times);
  };

  const overlay = new Overlay(task, {
    now: () => clock.now(),
    onLanguageChange: language => {
      setLanguage(language);
      overlay.rebuild();
      void saveLanguage(language);
    },
    onTaskChange: next => {
      task = next;
      void saveTask(origin, task);
    },
    onArm: (mode, isNow) => void arm(mode, isNow),
    onStop: () => void runner?.stop(),
    onSync: () => void resync(),
    onPick: index => void pick(index)
  });
  overlay.mount();
  overlay.setClock(clock.sync, false);
  overlay.setArmed(null);
  if (!clock.sync) void resync();

  function resync(): Promise<boolean> {
    pendingResync ??= runResync().finally(() => {
      pendingResync = null;
    });
    return pendingResync;
  }

  async function runResync(): Promise<boolean> {
    overlay.setClock(clock.sync, true);
    try {
      const sync = await clock.resync();
      await saveClock(origin, sync);
      overlay.setClock(sync, false);
      overlay.log(
        t(
          'log_synced',
          (sync.offsetMs / 1000).toFixed(3),
          (sync.uncertaintyMs / 1000).toFixed(3)
        )
      );
      return true;
    } catch (error) {
      overlay.setClock(clock.sync, false);
      overlay.log(t('log_sync_failed', String(error)), 'bad');
      return false;
    }
  }

  async function pick(index: number): Promise<void> {
    overlay.setOpen(false);
    const el = await pickElement(overlay.root, overlay.host);
    overlay.setOpen(true);
    if (!el) {
      overlay.log(t('log_pick_cancelled'));
      return;
    }
    const step = task.steps[index];
    const previousText = step.target.text;
    step.target = describeTarget(el);
    const isDerivedLabel =
      !step.label.trim() ||
      isDefaultStepLabel(step.label, index) ||
      step.label === previousText;
    if (isDerivedLabel) step.label = step.target.text || step.label;
    await saveTask(origin, task);
    overlay.setTask(task);
    overlay.flash(el);
    overlay.log(
      t('log_picked', index + 1, step.target.tag, step.target.text),
      'ok'
    );
  }

  function onEvent(event: RunnerEvent): void {
    switch (event.type) {
      case 'armed':
        overlay.setArmed({ mode: event.mode });
        overlay.log(
          t(
            'log_armed',
            modeName(event.mode),
            formatClock(event.fireAtServerMs)
          ),
          event.mode === 'live' ? 'warn' : ''
        );
        send({
          type: 'badge',
          text:
            event.mode === 'live'
              ? 'LIVE'
              : event.mode === 'manual'
                ? 'MAN'
                : 'DRY'
        });
        void holdWakeLock();
        watchSession();
        break;
      case 'step-start':
        overlay.log(t('log_step_waiting', event.stepIndex + 1));
        break;
      case 'click':
        overlay.log(
          t(
            'log_click',
            event.stepIndex + 1,
            event.attempt,
            formatClock(event.atServerMs)
          )
        );
        break;
      case 'step-done': {
        const verb = t(
          runner?.mode === 'live'
            ? 'done_live'
            : runner?.mode === 'manual'
              ? 'done_manual'
              : 'done_dry'
        );
        overlay.log(
          t(
            'log_step_done',
            event.result.stepIndex + 1,
            verb,
            formatClock(event.result.clickedAtServerMs),
            event.result.attempts,
            t(event.result.via === 'selector' ? 'via_selector' : 'via_text'),
            howSatisfied(event.result)
          ),
          'ok'
        );
        break;
      }
      case 'reloading':
        overlay.log(t('log_reloading', event.reloads), 'warn');
        break;
      case 'finished':
        overlay.setArmed({ done: true });
        overlay.log(t('log_finished', event.results.length), 'ok');
        send({ type: 'badge', text: 'OK' });
        send({
          type: 'notify',
          title: t('ext_name'),
          body: t('notify_finished')
        });
        beep(3);
        stopWatching();
        break;
      case 'failed':
        overlay.setArmed(null);
        overlay.log(t('log_failed', event.stepIndex + 1, event.reason), 'bad');
        send({ type: 'badge', text: 'ERR' });
        send({
          type: 'notify',
          title: t('ext_name'),
          body: t('notify_failed', event.stepIndex + 1)
        });
        beep(2);
        stopWatching();
        break;
      case 'warning':
        overlay.log(event.reason, 'warn');
        break;
      case 'stopped':
        overlay.setArmed(null);
        overlay.log(t('log_stopped'));
        send({ type: 'badge', text: '' });
        stopWatching();
        break;
    }
  }

  let wakeLock: WakeLockSentinel | null = null;
  let sessionTimer = 0;
  let hasWarnedSession = false;

  async function holdWakeLock(): Promise<void> {
    if (wakeLock || !('wakeLock' in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
      overlay.log(t('wake_lock_on'));
    } catch {
      overlay.log(t('wake_lock_off'), 'warn');
    }
  }

  function releaseWakeLock(): void {
    void wakeLock?.release();
    wakeLock = null;
  }

  function watchSession(): void {
    clearInterval(sessionTimer);
    hasWarnedSession = false;
    sessionTimer = window.setInterval(() => {
      if (hasWarnedSession || !runner?.isArmed) return;
      if (matchAnyText([task.alertText])) {
        hasWarnedSession = true;
        overlay.log(t('session_lost_log'), 'bad');
        send({
          type: 'notify',
          title: t('ext_name'),
          body: t('session_lost_notify')
        });
        beep(3);
      }
    }, 5000);
  }

  function stopWatching(): void {
    clearInterval(sessionTimer);
    clearInterval(resyncTimer);
    clearTimeout(finalResyncTimer);
    releaseWakeLock();
  }

  function makeRunner(): Runner {
    return new Runner(task, overlay.fireAt, {
      serverNow: () => clock.now(),
      reload: () => {
        isReloading = true;
        location.reload();
      },
      persist: state => saveArmed(origin, state),
      emit: onEvent,
      highlight: el => overlay.flash(el),
      handOver: el => {
        overlay.flash(el);
        el.scrollIntoView({ block: 'center' });
        el.focus();
        overlay.log(t('hand_over'), 'warn');
        beep(2);
      }
    });
  }

  function scheduleResync(): void {
    clearInterval(resyncTimer);
    clearTimeout(finalResyncTimer);
    resyncTimer = window.setInterval(() => {
      const remaining = overlay.fireAt - clock.now();
      if (remaining > 20_000 || Number.isNaN(remaining)) void resync();
    }, RESYNC_MS);
    const untilFinal = overlay.fireAt - clock.now() - FINAL_RESYNC_BEFORE_MS;
    if (untilFinal > 5000)
      finalResyncTimer = window.setTimeout(() => void resync(), untilFinal);
  }

  function warnAboutSync(mode: RunMode): boolean {
    if (mode === 'dry') return true;
    if (!clock.sync) {
      overlay.log(t('no_sync_refuse', modeName(mode)), 'bad');
      return false;
    }
    const ageMin = Math.round((Date.now() - clock.sync.syncedAt) / 60000);
    if (ageMin >= 5) overlay.log(t('log_sync_old', ageMin), 'warn');
    if (clock.sync.uncertaintyMs > COARSE_SYNC_MS)
      overlay.log(
        t('log_sync_coarse', (clock.sync.uncertaintyMs / 1000).toFixed(3)),
        'warn'
      );
    return true;
  }

  async function arm(mode: RunMode, isNow: boolean): Promise<void> {
    if (isArming) return;
    isArming = true;
    overlay.setBusy(true);
    try {
      const isAllowed = await checkArm(mode, isNow);
      if (!isAllowed) {
        overlay.setArmed(null);
        return;
      }
      await runner?.stop();
      runner = makeRunner();
      await runner.arm(mode, isNow);
      if (!isNow) scheduleResync();
    } finally {
      isArming = false;
    }
  }

  async function checkArm(mode: RunMode, isNow: boolean): Promise<boolean> {
    if (!isNow && Number.isNaN(overlay.fireAt)) {
      overlay.log(t('set_opening_time'), 'bad');
      return false;
    }
    if (!task.steps.some(step => step.target.selector || step.target.text)) {
      overlay.log(t('pick_at_least_one'), 'bad');
      return false;
    }
    if (!isNow && mode === 'live' && overlay.fireAt < clock.now() - 60_000) {
      overlay.log(t('opening_passed'), 'bad');
      return false;
    }
    if (!clock.sync || Date.now() - clock.sync.syncedAt > RESYNC_MS)
      await resync();
    return warnAboutSync(mode);
  }

  const armed = await loadArmed(origin);
  if (armed) {
    const verdict = resumeVerdict(
      armed,
      overlay.fireAt,
      clock.now(),
      Date.now()
    );
    if (verdict !== 'resume') {
      await saveArmed(origin, null);
      overlay.log(
        t(verdict === 'past' ? 'stale_past' : 'stale_discarded'),
        'warn'
      );
    } else {
      runner = makeRunner();
      overlay.log(t('resuming', armed.stepIndex + 1, armed.reloads), 'warn');
      await runner.resume(armed);
      if (armed.phase === 'waiting') scheduleResync();
    }
  }

  let isAlive = true;
  const frame = () => {
    if (!isAlive) return;
    overlay.tick(clock.now());
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  async function shutdown(): Promise<void> {
    isAlive = false;
    await runner?.stop();
    runner = null;
    stopWatching();
    overlay.destroy();
    send({ type: 'badge', text: '' });
    window.__najbrziPrst = false;
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && runner?.isArmed) void runner.stop();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && runner?.isArmed) void holdWakeLock();
    if (document.hidden && runner?.isArmed && !isReloading) {
      overlay.log(t('tab_hidden'), 'bad');
      beep(2);
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const language = isLanguageChange(changes);
    if (language) {
      setLanguage(language);
      overlay.rebuild();
    }
  });

  chrome.runtime.onMessage.addListener(
    (
      message: PopupMessage,
      _sender,
      reply: (value: PanelStateReply) => void
    ) => {
      if (message.type === 'shutdown') {
        void shutdown();
        reply({ isPanelOpen: false, isArmed: false });
        return;
      }
      if (message.type === 'toggle-panel') overlay.setOpen(!overlay.isOpen);
      reply({ isPanelOpen: overlay.isOpen, isArmed: !!runner?.isArmed });
    }
  );
}

if (!window.__najbrziPrst) {
  window.__najbrziPrst = true;
  main().catch((error: unknown) => {
    console.error('[Najbrži prst]', error);
  });
}
