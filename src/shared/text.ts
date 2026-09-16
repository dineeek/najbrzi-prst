const QUOTES = /[„“”"'`]/g;

export function normalizeText(value: string): string {
  return value.replace(QUOTES, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function hasSameText(a: string, b: string): boolean {
  return normalizeText(a) === normalizeText(b);
}

export function containsText(haystack: string, needle: string): boolean {
  const wanted = normalizeText(needle);
  return !!wanted && normalizeText(haystack).includes(wanted);
}

export function parsePattern(text: string): RegExp | null {
  const match = /^\/(.+)\/([a-z]*)$/i.exec(text.trim());
  if (!match) return null;
  try {
    const flags = match[2].includes('i') ? match[2] : `${match[2]}i`;
    return new RegExp(match[1], flags);
  } catch {
    return null;
  }
}

export function matchesText(candidate: string, pattern: string): boolean {
  const regex = parsePattern(pattern);
  if (regex) return regex.test(normalizeText(candidate));
  return hasSameText(candidate, pattern);
}

export function containsPattern(haystack: string, pattern: string): boolean {
  const regex = parsePattern(pattern);
  if (regex) return regex.test(normalizeText(haystack));
  return containsText(haystack, pattern);
}
