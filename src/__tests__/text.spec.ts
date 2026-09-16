import { describe, expect, it } from 'vitest';
import {
  containsPattern,
  containsText,
  hasSameText,
  matchesText,
  normalizeText,
  parsePattern
} from '../shared/text';

describe('normalizeText', () => {
  it('strips Croatian quotes and collapses whitespace', () => {
    expect(normalizeText('  „Podnesi   prijavu“ ')).toBe('podnesi prijavu');
  });

  it('is case insensitive', () => {
    expect(hasSameText('DA, PODNESI PRIJAVU', 'Da, podnesi prijavu')).toBe(
      true
    );
  });

  it('containsText ignores empty needles', () => {
    expect(containsText('Prijava uspješno podnesena', '')).toBe(false);
    expect(containsText('Prijava uspješno podnesena', 'uspješno')).toBe(true);
  });
});

describe('patterns', () => {
  it('parses /regex/ text and forces case insensitivity', () => {
    expect(parsePattern('/^da\\b/')?.flags).toContain('i');
    expect(parsePattern('Da, podnesi prijavu')).toBeNull();
    expect(parsePattern('/[/')).toBeNull();
  });

  it('matchesText uses the regex against normalized button text', () => {
    expect(matchesText('„Da, podnesi prijavu“', '/^da\\b/')).toBe(true);
    expect(matchesText('Da', '/^da\\b/')).toBe(true);
    expect(matchesText('Dalje', '/^da\\b/')).toBe(false);
    expect(matchesText('Ne, vrati me natrag', '/^da\\b/')).toBe(false);
  });

  it('containsPattern works for plain and regex needles', () => {
    expect(
      containsPattern('Prijava uspješno podnesena.', 'uspješno podnesena')
    ).toBe(true);
    expect(containsPattern('Jeste li sigurni?', '/sigurn|potvrd/')).toBe(true);
  });
});
