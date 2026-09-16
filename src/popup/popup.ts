import './popup.css';
import type { PanelStateReply, PopupMessage } from '../shared/messages';
import {
  LANGUAGES,
  getLanguage,
  setLanguage,
  t,
  type Language
} from '../shared/i18n';
import { loadLanguage, saveLanguage } from '../shared/storage';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = '',
  className = ''
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(text: string, onClick: () => void, className = 'btn') {
  const node = el('button', text, className);
  node.addEventListener('click', onClick);
  return node;
}

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function originOf(url: string | undefined): string | null {
  try {
    const parsed = new URL(url ?? '');
    return /^https?:$/.test(parsed.protocol) ? parsed.origin : null;
  } catch {
    return null;
  }
}

function hostOf(pattern: string): string {
  return pattern.replace(/^https?:\/\//, '').replace(/\/\*$/, '');
}

async function askPanel(
  tabId: number,
  message: PopupMessage
): Promise<PanelStateReply | null> {
  try {
    return (await chrome.tabs.sendMessage(tabId, message)) as PanelStateReply;
  } catch {
    return null;
  }
}

async function removeSite(pattern: string): Promise<void> {
  const tabs = await chrome.tabs.query({ url: pattern });
  for (const tab of tabs)
    if (tab.id !== undefined) await askPanel(tab.id, { type: 'shutdown' });
  await chrome.permissions.remove({ origins: [pattern] });
  await render();
}

async function enabledPatterns(): Promise<string[]> {
  const { origins = [] } = await chrome.permissions.getAll();
  return origins.filter(origin => /^https?:\/\//.test(origin)).sort();
}

function sitesList(patterns: string[]): HTMLElement[] {
  if (!patterns.length) return [];
  const list = el('ul');
  for (const pattern of patterns) {
    const item = el('li', hostOf(pattern));
    item.append(button('×', () => void removeSite(pattern), 'btn small'));
    list.append(item);
  }
  return [el('p', t('popup_enabled_sites')), list];
}

function paintStatus(status: HTMLElement, reply: PanelStateReply | null) {
  if (!reply) {
    status.textContent = t('popup_loading');
    status.className = 'status';
    return;
  }
  status.textContent = reply.isArmed ? t('popup_armed') : t('popup_idle');
  status.className = reply.isArmed ? 'status armed' : 'status';
}

function languageRow(): HTMLElement {
  const select = el('select', '', 'lang');
  for (const code of LANGUAGES) {
    const option = el(
      'option',
      t(code === 'hr' ? 'language_hr' : 'language_en')
    );
    option.value = code;
    option.selected = code === getLanguage();
    select.append(option);
  }
  select.addEventListener('change', async () => {
    setLanguage(select.value as Language);
    await saveLanguage(getLanguage());
    await render();
  });
  const row = el('p', '', 'row');
  row.append(el('span', t('language_label')), select);
  return row;
}

async function render(): Promise<void> {
  const root = document.getElementById('root');
  if (!root) return;
  setLanguage(await loadLanguage());
  const main = el('main');
  main.append(el('h1', t('panel_title')));
  const tab = await activeTab();
  const origin = originOf(tab?.url);
  const patterns = await enabledPatterns();

  if (!origin || tab?.id === undefined) {
    main.append(
      el('p', t('popup_not_a_site')),
      ...sitesList(patterns),
      languageRow()
    );
    root.replaceChildren(main);
    return;
  }

  const tabId = tab.id;
  const host = new URL(origin).host;
  const pattern = `${origin}/*`;
  if (!patterns.includes(pattern)) {
    const status = el('p', '', 'status');
    main.append(
      el('p', t('popup_not_enabled', host)),
      button(t('popup_enable_here', host), async () => {
        const granted = await chrome.permissions.request({
          origins: [pattern]
        });
        if (!granted) {
          status.textContent = t('popup_denied');
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 600));
        await render();
      }),
      status,
      ...sitesList(patterns),
      languageRow()
    );
    root.replaceChildren(main);
    return;
  }

  const status = el('p', '', 'status');
  paintStatus(status, await askPanel(tabId, { type: 'panel-state' }));
  main.append(
    el('p', t('popup_site', host)),
    status,
    button(t('popup_toggle'), async () => {
      paintStatus(status, await askPanel(tabId, { type: 'toggle-panel' }));
    }),
    button(
      t('popup_remove_here', host),
      () => void removeSite(pattern),
      'btn secondary'
    ),
    ...sitesList(patterns.filter(known => known !== pattern)),
    languageRow()
  );
  root.replaceChildren(main);
}

void render();
