import type { BackgroundMessage, OffscreenMessage } from '../shared/messages';
import contentScript from '../content/index.ts?script&iife';

const SCRIPT_ID = 'najbrzi-prst';

function sitePatterns(origins: string[]): string[] {
  return origins.filter(origin => /^https?:\/\//.test(origin));
}

async function registerSites(origins: string[]): Promise<void> {
  const matches = sitePatterns(origins);
  const existing = await chrome.scripting.getRegisteredContentScripts({
    ids: [SCRIPT_ID]
  });
  if (!matches.length) {
    if (existing.length)
      await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    return;
  }
  const script: chrome.scripting.RegisteredContentScript = {
    id: SCRIPT_ID,
    matches,
    js: [contentScript],
    runAt: 'document_start',
    persistAcrossSessions: true
  };
  if (existing.length) await chrome.scripting.updateContentScripts([script]);
  else await chrome.scripting.registerContentScripts([script]);
}

async function reconcile(): Promise<void> {
  const { origins = [] } = await chrome.permissions.getAll();
  await registerSites(origins);
}

async function injectInto(origins: string[]): Promise<void> {
  for (const pattern of sitePatterns(origins)) {
    const tabs = await chrome.tabs.query({ url: pattern });
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      await chrome.scripting
        .executeScript({ target: { tabId: tab.id }, files: [contentScript] })
        .catch(() => undefined);
    }
  }
}

let offscreenCreation: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]
  });
  if (contexts.length) return;
  offscreenCreation ??= chrome.offscreen
    .createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: 'Alert sound when the countdown fires'
    })
    .finally(() => {
      offscreenCreation = null;
    });
  await offscreenCreation;
}

async function playBeep(times: number): Promise<void> {
  await ensureOffscreen();
  const message: OffscreenMessage = { type: 'play-beep', times };
  await chrome.runtime.sendMessage(message).catch(() => undefined);
}

chrome.runtime.onInstalled.addListener(() => void reconcile());
chrome.runtime.onStartup.addListener(() => void reconcile());
chrome.permissions.onAdded.addListener(added => {
  void reconcile().then(() => injectInto(added.origins ?? []));
});
chrome.permissions.onRemoved.addListener(() => void reconcile());

chrome.runtime.onMessage.addListener(
  (message: BackgroundMessage | OffscreenMessage, sender) => {
    if (message.type === 'badge') {
      const tabId = sender.tab?.id;
      if (tabId === undefined) return;
      void chrome.action.setBadgeBackgroundColor({
        color: message.text === 'LIVE' ? '#f85149' : '#1f6feb',
        tabId
      });
      void chrome.action.setBadgeText({ text: message.text, tabId });
      return;
    }
    if (message.type === 'notify') {
      void chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: message.title,
        message: message.body,
        priority: 2
      });
      return;
    }
    if (message.type === 'beep') void playBeep(message.times);
  }
);
