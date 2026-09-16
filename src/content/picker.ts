import { clickableAncestor, visibleText } from '../shared/selector';
import { t } from '../shared/i18n';

function box(root: ShadowRoot, className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  root.append(el);
  return el;
}

function isClickableTag(el: Element): boolean {
  return (
    ['BUTTON', 'A', 'INPUT', 'LABEL', 'SUMMARY'].includes(el.tagName) ||
    el.getAttribute('role') === 'button'
  );
}

function looksClickable(el: Element): boolean {
  return isClickableTag(el) || getComputedStyle(el).cursor === 'pointer';
}

function isScrollable(el: Element): boolean {
  const style = getComputedStyle(el);
  return (
    /auto|scroll/.test(style.overflowY + style.overflowX) &&
    el.scrollHeight > el.clientHeight
  );
}

function pageElementsAt(x: number, y: number, host: HTMLElement): Element[] {
  return document
    .elementsFromPoint(x, y)
    .filter(el => el !== host && !host.contains(el));
}

function deepElementAt(
  x: number,
  y: number,
  host: HTMLElement
): Element | null {
  let el: Element | null = pageElementsAt(x, y, host)[0] ?? null;
  while (el?.shadowRoot) {
    const shadow: ShadowRoot = el.shadowRoot;
    const inner = shadow.elementsFromPoint(x, y).find(node => node !== el);
    if (!inner) break;
    el = inner;
  }
  return el;
}

function elementUnder(
  x: number,
  y: number,
  host: HTMLElement
): HTMLElement | null {
  const under = deepElementAt(x, y, host);
  if (!under) return null;
  const clickable = clickableAncestor(under);
  if (clickable !== under || isClickableTag(under)) return clickable;
  return looksClickable(under) ? (under as HTMLElement) : null;
}

export function pickElement(
  root: ShadowRoot,
  host: HTMLElement
): Promise<HTMLElement | null> {
  return new Promise(resolve => {
    const shield = box(root, 'pick-shield');
    const highlight = box(root, 'pick-box');
    const tip = box(root, 'pick-tip');
    const banner = box(root, 'pick-banner');
    banner.textContent = t('pick_banner');
    let current: HTMLElement | null = null;
    let pointer = { x: -1, y: -1 };

    const paint = () => {
      if (!current) {
        highlight.style.display = 'none';
        tip.style.display = 'none';
        return;
      }
      const r = current.getBoundingClientRect();
      highlight.style.display = 'block';
      highlight.style.left = `${r.left - 2}px`;
      highlight.style.top = `${r.top - 2}px`;
      highlight.style.width = `${r.width + 4}px`;
      highlight.style.height = `${r.height + 4}px`;
      tip.style.display = 'block';
      tip.textContent = `${current.tagName.toLowerCase()} „${visibleText(current).trim().slice(0, 60)}"`;
      tip.style.left = `${Math.max(8, r.left)}px`;
      tip.style.top = `${r.bottom + 6 > window.innerHeight - 30 ? r.top - 30 : r.bottom + 6}px`;
    };

    const refresh = () => {
      if (pointer.x >= 0) current = elementUnder(pointer.x, pointer.y, host);
      paint();
    };

    const onMove = (event: MouseEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      refresh();
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const target = pageElementsAt(event.clientX, event.clientY, host).find(
        isScrollable
      );
      if (target) target.scrollBy(event.deltaX, event.deltaY);
      else window.scrollBy(event.deltaX, event.deltaY);
      refresh();
    };

    const finish = (value: HTMLElement | null) => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('scroll', refresh, true);
      shield.remove();
      highlight.remove();
      tip.remove();
      banner.remove();
      resolve(value);
    };

    const onClick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const picked =
        elementUnder(event.clientX, event.clientY, host) ?? current;
      if (picked) finish(picked);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      finish(null);
    };

    shield.addEventListener('mousemove', onMove);
    shield.addEventListener('click', onClick);
    shield.addEventListener('wheel', onWheel, { passive: false });
    shield.addEventListener('contextmenu', event => event.preventDefault());
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('scroll', refresh, true);
  });
}
