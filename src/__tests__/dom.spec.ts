import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clickElement,
  findByText,
  isEnabled,
  matchAnyText,
  resolveTarget,
  waitForTarget
} from '../shared/dom';
import { mockLayout } from './__mocks__/layout';

beforeAll(mockLayout);

describe('resolveTarget', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button class="ant-btn"><span>Odustani</span></button>
      <button class="ant-btn ant-btn-primary" disabled><span>Podnesi prijavu</span></button>`;
  });

  it('finds by selector when its text still matches', () => {
    const found = resolveTarget({
      selector: 'button.ant-btn-primary',
      text: 'Podnesi prijavu',
      tag: 'button'
    });
    expect(found?.via).toBe('selector');
    expect(found?.el.textContent).toBe('Podnesi prijavu');
  });

  it('falls back to text when the selector points at a different button', () => {
    const found = resolveTarget({
      selector: 'button:nth-of-type(1)',
      text: 'Podnesi prijavu',
      tag: 'button'
    });
    expect(found?.via).toBe('text');
    expect(found?.el.textContent).toBe('Podnesi prijavu');
  });

  it('prefers a visible text match over a hidden selector match', () => {
    document.body.innerHTML = `
      <div style="display:none"><button id="old"><span>Da, podnesi prijavu</span></button></div>
      <div><button id="new"><span>Da, podnesi prijavu</span></button></div>`;
    const found = resolveTarget({
      selector: '#old',
      text: 'Da, podnesi prijavu',
      tag: 'button'
    });
    expect(found?.el.id).toBe('new');
    expect(found?.via).toBe('text');
  });

  it('keeps a visible but disabled selector match instead of another enabled button', () => {
    document.body.innerHTML = `
      <button id="real" disabled><span>Podnesi prijavu</span></button>
      <button id="other"><span>Podnesi prijavu</span></button>`;
    const found = resolveTarget({
      selector: '#real',
      text: 'Podnesi prijavu',
      tag: 'button'
    });
    expect(found?.el.id).toBe('real');
  });

  it('matches a regex button text and prefers the button inside a dialog', () => {
    document.body.innerHTML = `
      <button id="outside"><span>Da</span></button>
      <div role="dialog"><button id="no"><span>Ne, vrati me natrag</span></button><button id="yes"><span>Da, podnesi prijavu</span></button></div>`;
    const found = resolveTarget({
      selector: '',
      text: '/^da\\b/',
      tag: 'button'
    });
    expect(found?.el.id).toBe('yes');
  });

  it('never picks a cancel-like button through text fallback', () => {
    document.body.innerHTML =
      '<div role="dialog"><button id="x"><span>Da, odustani</span></button></div>';
    expect(
      resolveTarget({ selector: '', text: '/^da\\b/', tag: 'button' })
    ).toBeNull();
    document.body.innerHTML =
      '<button><span>Yes, go back</span></button><button><span>No</span></button><button><span>Close</span></button>';
    expect(
      resolveTarget({ selector: '', text: '/^(yes|no|close)/', tag: 'button' })
    ).toBeNull();
  });

  it('refuses a picked selector whose text reads like cancel', () => {
    document.body.innerHTML =
      '<button id="real"><span>Da, odustani</span></button>';
    expect(
      resolveTarget({ selector: '#real', text: '/^da\\b/', tag: 'button' })
    ).toBeNull();
    expect(
      resolveTarget(
        { selector: '#real', text: '/^da\\b/', tag: 'button' },
        document,
        '/nothing/'
      )?.el.id
    ).toBe('real');
  });

  it('resolves and matches buttons inside shadow DOM', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const shadow = document
      .getElementById('app')!
      .attachShadow({ mode: 'open' });
    shadow.innerHTML =
      '<p>Jeste li sigurni?</p><button class="go"><span>Podnesi prijavu</span></button>';
    const bySelector = resolveTarget({
      selector: '#app >>> button.go',
      text: 'Podnesi prijavu',
      tag: 'button'
    });
    expect(bySelector?.via).toBe('selector');
    const byText = resolveTarget({
      selector: '',
      text: 'Podnesi prijavu',
      tag: 'button'
    });
    expect(byText?.via).toBe('text');
    expect(byText?.el).toBe(bySelector?.el);
    expect(findByText('Podnesi prijavu')).toHaveLength(1);
  });

  it('honors a custom never-click pattern and ignores the default one', () => {
    document.body.innerHTML =
      '<button id="a"><span>Close</span></button><button id="b"><span>Proceed</span></button>';
    const target = { selector: '', text: '/close|proceed/', tag: 'button' };
    expect(resolveTarget(target, document, '/proceed/')?.el.id).toBe('a');
    expect(resolveTarget(target)?.el.id).toBe('b');
  });

  it('returns null when nothing matches', () => {
    expect(
      resolveTarget({ selector: '#nope', text: 'Ne postoji', tag: 'button' })
    ).toBeNull();
  });

  it('finds icon-only buttons through their title', () => {
    document.body.innerHTML =
      '<a title="Više informacija o pozivu"><svg></svg></a>';
    expect(findByText('više informacija o pozivu')).toHaveLength(1);
  });

  it('matches input buttons by value', () => {
    document.body.innerHTML = '<input type="submit" value="Pošalji" />';
    expect(findByText('pošalji')).toHaveLength(1);
  });
});

describe('isEnabled', () => {
  it('respects disabled, aria-disabled and fieldset', () => {
    document.body.innerHTML = `
      <button id="a" disabled></button>
      <button id="b" aria-disabled="true"></button>
      <fieldset disabled><button id="c"></button></fieldset>
      <button id="d"></button>`;
    expect(isEnabled(document.getElementById('a')!)).toBe(false);
    expect(isEnabled(document.getElementById('b')!)).toBe(false);
    expect(isEnabled(document.getElementById('c')!)).toBe(false);
    expect(isEnabled(document.getElementById('d')!)).toBe(true);
  });
});

describe('clickElement', () => {
  it('fires mouse events and click on the element', () => {
    document.body.innerHTML = '<button id="x">Go</button>';
    const el = document.getElementById('x')!;
    const onClick = vi.fn();
    const onMouseDown = vi.fn();
    el.addEventListener('click', onClick);
    el.addEventListener('mousedown', onMouseDown);
    clickElement(el);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onMouseDown).toHaveBeenCalledTimes(1);
  });
});

describe('waitForTarget', () => {
  it('resolves once the disabled attribute is removed', async () => {
    document.body.innerHTML =
      '<button id="s" disabled><span>Podnesi prijavu</span></button>';
    const el = document.getElementById('s')!;
    setTimeout(() => el.removeAttribute('disabled'), 30);
    const found = await waitForTarget(
      { selector: '#s', text: 'Podnesi prijavu', tag: 'button' },
      { timeoutMs: 1000, requireEnabled: true, heartbeatMs: 10 }
    );
    expect(found?.el).toBe(el);
  });

  it('resolves null on timeout', async () => {
    document.body.innerHTML = '<button disabled>Podnesi prijavu</button>';
    expect(
      await waitForTarget(
        { selector: '', text: 'Podnesi prijavu', tag: 'button' },
        { timeoutMs: 40, requireEnabled: true, heartbeatMs: 10 }
      )
    ).toBeNull();
  });

  it('resolves null when aborted', async () => {
    document.body.innerHTML = '';
    const controller = new AbortController();
    const pending = waitForTarget(
      { selector: '', text: 'Nema', tag: 'button' },
      { timeoutMs: 1000, requireEnabled: true, signal: controller.signal }
    );
    controller.abort();
    expect(await pending).toBeNull();
  });
});

describe('matchAnyText', () => {
  it('ignores text hidden through a stylesheet rule', () => {
    document.body.innerHTML = `
      <style>.closed { display: none; }</style>
      <div class="closed">Prijava uspješno podnesena</div>`;
    expect(matchAnyText(['uspješno podnesena'])).toBeNull();
    document.querySelector('.closed')!.classList.remove('closed');
    expect(matchAnyText(['uspješno podnesena'])).toBe('uspješno podnesena');
  });

  it('reads text rendered inside shadow DOM', () => {
    document.body.innerHTML = '<div id="host"></div>';
    const shadow = document
      .getElementById('host')!
      .attachShadow({ mode: 'open' });
    shadow.innerHTML = '<p>Prijava uspješno podnesena</p>';
    expect(matchAnyText(['uspješno podnesena'])).toBe('uspješno podnesena');
  });

  it('reports which text matched and ignores hidden text', () => {
    document.body.innerHTML = `
      <div hidden>Prijava uspješno podnesena</div>
      <div>Jeste li sigurni da želite podnijeti prijavu?</div>`;
    expect(
      matchAnyText(['Prijava uspješno podnesena', 'Jeste li sigurni'])
    ).toBe('Jeste li sigurni');
  });

  it('returns null when nothing matches or every pattern is blank', () => {
    document.body.innerHTML = '<div>Prijava</div>';
    expect(matchAnyText(['nikad'])).toBeNull();
    expect(matchAnyText(['', '  '])).toBeNull();
  });
});
