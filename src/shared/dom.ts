import type { Target } from './models';
import { DEFAULT_NEVER_CLICK } from './models';
import { containsPattern, matchesText } from './text';
import { SHADOW_SEPARATOR, visibleText } from './selector';

const CLICKABLE =
  'button, a, [role="button"], input[type="submit"], input[type="button"], summary';
const DIALOG =
  'dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"], .ant-modal, .ant-modal-confirm';
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);

export interface Resolved {
  el: HTMLElement;
  via: 'selector' | 'text';
}

function isInlineHidden(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hidden) return true;
  return el.style.display === 'none' || el.style.visibility === 'hidden';
}

function isDisplayed(el: Element): boolean {
  if (typeof el.checkVisibility === 'function')
    return el.checkVisibility({
      visibilityProperty: true,
      contentVisibilityAuto: true
    });
  let node: Element | null = el;
  while (node) {
    if (isInlineHidden(node)) return false;
    node = node.parentElement;
  }
  return true;
}

export function isVisible(el: Element): boolean {
  return isDisplayed(el) && el.getClientRects().length > 0;
}

export function isEnabled(el: Element): boolean {
  if (el.hasAttribute('disabled')) return false;
  if (el.getAttribute('aria-disabled') === 'true') return false;
  if (el.classList.contains('ant-btn-disabled')) return false;
  return !el.closest('fieldset[disabled]');
}

export function isInDialog(el: Element): boolean {
  return !!el.closest(DIALOG);
}

export function isForbidden(
  el: Element,
  neverClick = DEFAULT_NEVER_CLICK
): boolean {
  return containsPattern(visibleText(el), neverClick);
}

export function querySelectorDeep(
  selector: string,
  root: ParentNode = document
): Element | null {
  const parts = selector.split(SHADOW_SEPARATOR);
  let scope: ParentNode = root;
  for (const part of parts.slice(0, -1)) {
    const shadow = scope.querySelector(part)?.shadowRoot;
    if (!shadow) return null;
    scope = shadow;
  }
  return scope.querySelector(parts[parts.length - 1]);
}

function clickablesDeep(root: ParentNode): HTMLElement[] {
  const found = Array.from(root.querySelectorAll<HTMLElement>(CLICKABLE));
  for (const el of root.querySelectorAll('*'))
    if (el.shadowRoot) found.push(...clickablesDeep(el.shadowRoot));
  return found;
}

export function findByText(
  pattern: string,
  root: ParentNode = document
): HTMLElement[] {
  if (!pattern.trim()) return [];
  return clickablesDeep(root).filter(el =>
    matchesText(visibleText(el), pattern)
  );
}

function rank(item: Resolved): number {
  return (isInDialog(item.el) ? 0 : 1) + (isEnabled(item.el) ? 0 : 2);
}

export function resolveTarget(
  target: Target,
  root: ParentNode = document,
  neverClick = DEFAULT_NEVER_CLICK
): Resolved | null {
  let bySelector: Resolved | null = null;
  if (target.selector) {
    let el: Element | null = null;
    try {
      el = querySelectorDeep(target.selector, root);
    } catch {
      el = null;
    }
    if (
      el instanceof HTMLElement &&
      (!target.text || matchesText(visibleText(el), target.text)) &&
      !isForbidden(el, neverClick)
    ) {
      bySelector = { el, via: 'selector' };
    }
  }
  if (bySelector && isVisible(bySelector.el)) return bySelector;
  const byText = findByText(target.text, root)
    .filter(el => el !== bySelector?.el && !isForbidden(el, neverClick))
    .map<Resolved>(el => ({ el, via: 'text' }));
  const visible = byText
    .filter(item => isVisible(item.el))
    .sort((a, b) => rank(a) - rank(b));
  return visible[0] ?? bySelector ?? byText[0] ?? null;
}

export function readyTarget(
  target: Target,
  requireEnabled: boolean,
  neverClick = DEFAULT_NEVER_CLICK
): Resolved | null {
  const found = resolveTarget(target, document, neverClick);
  if (!found || !isVisible(found.el)) return null;
  if (requireEnabled && !isEnabled(found.el)) return null;
  return found;
}

export function clickElement(el: HTMLElement): void {
  const init: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true
  };
  if (typeof PointerEvent !== 'undefined')
    el.dispatchEvent(new PointerEvent('pointerdown', init));
  el.dispatchEvent(new MouseEvent('mousedown', init));
  if (typeof PointerEvent !== 'undefined')
    el.dispatchEvent(new PointerEvent('pointerup', init));
  el.dispatchEvent(new MouseEvent('mouseup', init));
  el.click();
}

function appendVisibleText(node: Node, parts: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    parts.push(node.textContent ?? '');
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  if (SKIP_TAGS.has(el.tagName) || !isDisplayed(el)) return;
  if (el.shadowRoot)
    for (const child of el.shadowRoot.childNodes)
      appendVisibleText(child, parts);
  for (const child of el.childNodes) appendVisibleText(child, parts);
}

export function collectVisibleText(root: Element | null): string {
  if (!root) return '';
  const parts: string[] = [];
  appendVisibleText(root, parts);
  return parts.join(' ');
}

export function matchAnyText(
  patterns: string[],
  root: Element | null = document.body
): string | null {
  const wanted = patterns.filter(pattern => pattern.trim());
  if (!wanted.length) return null;
  const page = collectVisibleText(root);
  return wanted.find(pattern => containsPattern(page, pattern)) ?? null;
}

function observeAll(check: () => void): () => void {
  const observer = new MutationObserver(check);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['disabled', 'class', 'aria-disabled', 'style', 'hidden']
  });
  return () => observer.disconnect();
}

export interface WaitOptions {
  timeoutMs: number;
  heartbeatMs?: number;
  signal?: AbortSignal;
}

export function waitFor<T>(
  probe: () => T | null | undefined,
  options: WaitOptions
): Promise<T | null> {
  return new Promise(resolve => {
    let stopObserving = () => {};
    let heartbeat = 0;
    let timeout = 0;
    const finish = (value: T | null) => {
      stopObserving();
      clearInterval(heartbeat);
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onAbort);
      resolve(value);
    };
    const onAbort = () => finish(null);
    const check = () => {
      const value = probe();
      if (value !== null && value !== undefined) finish(value);
    };
    if (options.signal?.aborted) return finish(null);
    options.signal?.addEventListener('abort', onAbort);
    stopObserving = observeAll(check);
    heartbeat = window.setInterval(check, options.heartbeatMs ?? 100);
    timeout = window.setTimeout(() => finish(null), options.timeoutMs);
    check();
  });
}

export function waitForTarget(
  target: Target,
  options: WaitOptions & { requireEnabled: boolean; neverClick?: string }
): Promise<Resolved | null> {
  return waitFor(
    () => readyTarget(target, options.requireEnabled, options.neverClick),
    options
  );
}

export function waitForAnyText(
  patterns: string[],
  timeoutMs: number,
  signal?: AbortSignal
): Promise<string | null> {
  return waitFor(() => matchAnyText(patterns), { timeoutMs, signal });
}

export async function waitForText(
  text: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<boolean> {
  return (await waitForAnyText([text], timeoutMs, signal)) !== null;
}
