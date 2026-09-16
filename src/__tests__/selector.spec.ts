import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildSelector,
  clickableAncestor,
  describeTarget
} from '../shared/selector';

describe('buildSelector', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="app">
        <div class="ant-row">
          <button class="ant-btn ant-btn-default css-1a2b3c"><span>Odustani</span></button>
          <button class="ant-btn ant-btn-primary css-1a2b3c" disabled><span>Podnesi prijavu</span></button>
        </div>
        <button id="confirm"><span>Da, podnesi prijavu</span></button>
      </div>`;
  });

  it('prefers a stable id', () => {
    const el = document.getElementById('confirm')!;
    expect(buildSelector(el)).toBe('#confirm');
  });

  it('builds a unique path without hashed or state classes', () => {
    const el = document.querySelectorAll('button')[1];
    const selector = buildSelector(el);
    expect(selector).not.toContain('css-');
    expect(selector).not.toContain('disabled');
    expect(document.querySelectorAll(selector)).toHaveLength(1);
    expect(document.querySelector(selector)).toBe(el);
  });

  it('describes the clickable ancestor when an inner span is picked', () => {
    const span = document.querySelectorAll('button')[1].querySelector('span')!;
    expect(clickableAncestor(span).tagName).toBe('BUTTON');
    const target = describeTarget(span);
    expect(target.tag).toBe('button');
    expect(target.text).toBe('Podnesi prijavu');
    expect(document.querySelector(target.selector)).toBe(span.parentElement);
  });

  it('builds a host >>> inner selector for shadow DOM elements', () => {
    document.body.innerHTML = '<div id="widget"></div>';
    const shadow = document
      .getElementById('widget')!
      .attachShadow({ mode: 'open' });
    shadow.innerHTML = '<button id="ok"><span>Go</span></button>';
    const inner = shadow.querySelector('button')!;
    expect(buildSelector(inner)).toBe('#widget >>> #ok');
    expect(describeTarget(inner.querySelector('span')!).selector).toBe(
      '#widget >>> #ok'
    );
  });

  it('skips auto-generated ids', () => {
    document.body.innerHTML =
      '<div><button id=":r3:">Go</button><button>Other</button></div>';
    const el = document.querySelector('button')!;
    expect(buildSelector(el)).not.toContain(':r3:');
    expect(document.querySelector(buildSelector(el))).toBe(el);
  });
});
