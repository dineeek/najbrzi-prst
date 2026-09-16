function isShown(el: Element): boolean {
  let node: Element | null = el;
  while (node) {
    if (node instanceof HTMLElement && node.hidden) return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    node = node.parentElement;
  }
  return true;
}

export function mockLayout(): void {
  Element.prototype.getClientRects = function (this: Element) {
    const rect = { x: 0, y: 0, width: 10, height: 10 } as DOMRect;
    const list = [rect] as unknown as DOMRectList;
    return list;
  };
  Element.prototype.checkVisibility = function (this: Element) {
    return isShown(this);
  };
}
