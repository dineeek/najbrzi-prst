import type { Target } from './models';

const CLICKABLE =
  'button, a, [role="button"], input[type="submit"], input[type="button"], label';
const UNSTABLE_CLASS =
  /(^css-|^sc-|^_|^jsx-|hover|focus|active|disabled|loading|selected|checked|open|visible|hidden|\d{3,})/;
const UNSTABLE_ID = /^(:|r\d|rc[-_]|radix|mui|ember|react|__)/i;

export function clickableAncestor(el: Element): HTMLElement {
  const found = el.closest(CLICKABLE);
  return (found ?? el) as HTMLElement;
}

function isStableId(id: string): boolean {
  return !!id && !UNSTABLE_ID.test(id) && !/^\d/.test(id) && !/\d{3,}/.test(id);
}

function stableClasses(el: Element): string[] {
  return Array.from(el.classList)
    .filter(name => !UNSTABLE_CLASS.test(name))
    .slice(0, 2);
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape
    ? CSS.escape(value)
    : value.replace(/([^\w-])/g, '\\$1');
}

function segmentFor(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const classes = stableClasses(el)
    .map(name => `.${cssEscape(name)}`)
    .join('');
  const parent = el.parentElement;
  if (!parent) return tag;
  const sameTag = Array.from(parent.children).filter(
    child => child.tagName === el.tagName
  );
  const nth =
    sameTag.length > 1 ? `:nth-of-type(${sameTag.indexOf(el) + 1})` : '';
  return `${tag}${classes}${nth}`;
}

function isUnique(
  root: Document | ShadowRoot,
  selector: string,
  el: Element
): boolean {
  try {
    const matches = root.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === el;
  } catch {
    return false;
  }
}

export const SHADOW_SEPARATOR = ' >>> ';

export function buildSelector(el: Element): string {
  const root = el.getRootNode() as Document | ShadowRoot;
  const local = buildLocalSelector(el, root);
  if (root instanceof ShadowRoot)
    return `${buildSelector(root.host)}${SHADOW_SEPARATOR}${local}`;
  return local;
}

function buildLocalSelector(el: Element, root: Document | ShadowRoot): string {
  if (isStableId(el.id) && isUnique(root, `#${cssEscape(el.id)}`, el))
    return `#${cssEscape(el.id)}`;
  for (const attr of ['data-testid', 'data-test', 'data-cy', 'name']) {
    const value = el.getAttribute(attr);
    if (value) {
      const candidate = `${el.tagName.toLowerCase()}[${attr}="${cssEscape(value)}"]`;
      if (isUnique(root, candidate, el)) return candidate;
    }
  }
  const segments: string[] = [];
  let current: Element | null = el;
  while (current && current.tagName !== 'HTML') {
    segments.unshift(segmentFor(current));
    const candidate = segments.join(' > ');
    if (isUnique(root, candidate, el)) return candidate;
    const parent: Element | null = current.parentElement;
    if (parent && isStableId(parent.id)) {
      const anchored = `#${cssEscape(parent.id)} > ${candidate}`;
      if (isUnique(root, anchored, el)) return anchored;
    }
    current = parent;
  }
  return segments.join(' > ');
}

export function visibleText(el: Element): string {
  if (el instanceof HTMLInputElement) return el.value;
  const text = (el.textContent ?? '').trim();
  if (text) return text;
  return (
    el.getAttribute('aria-label') ||
    el.getAttribute('title') ||
    el.querySelector('img[alt], svg[aria-label]')?.getAttribute('alt') ||
    el.querySelector('svg[aria-label]')?.getAttribute('aria-label') ||
    ''
  );
}

export function describeTarget(el: Element): Target {
  const clickable = clickableAncestor(el);
  return {
    selector: buildSelector(clickable),
    text: visibleText(clickable).replace(/\s+/g, ' ').trim(),
    tag: clickable.tagName.toLowerCase()
  };
}
