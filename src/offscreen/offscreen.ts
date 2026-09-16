import type { BackgroundMessage, OffscreenMessage } from '../shared/messages';

let audio: AudioContext | null = null;

function play(times: number): void {
  audio ??= new AudioContext();
  const ctx = audio;
  void ctx.resume().then(() => {
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.2;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.25);
      osc.stop(ctx.currentTime + i * 0.25 + 0.15);
    }
  });
}

chrome.runtime.onMessage.addListener(
  (message: BackgroundMessage | OffscreenMessage) => {
    if (message.type === 'play-beep') play(message.times);
  }
);
