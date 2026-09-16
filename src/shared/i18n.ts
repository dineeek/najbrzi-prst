import en from '../../public/_locales/en/messages.json' with { type: 'json' };
import hr from '../../public/_locales/hr/messages.json' with { type: 'json' };

export type MessageKey = keyof typeof en;
export type Language = 'hr' | 'en';

export const LANGUAGES: Language[] = ['hr', 'en'];
export const DEFAULT_LANGUAGE: Language = 'hr';

const tables: Record<Language, Record<MessageKey, { message: string }>> = {
  en,
  hr
};

let current: Language = DEFAULT_LANGUAGE;

export function getLanguage(): Language {
  return current;
}

export function setLanguage(language: string | null | undefined): Language {
  current = isLanguage(language) ? language : DEFAULT_LANGUAGE;
  return current;
}

export function isLanguage(value: unknown): value is Language {
  return value === 'hr' || value === 'en';
}

function fill(template: string, values: string[]): string {
  return template.replace(
    /\$(\d)/g,
    (_, index: string) => values[Number(index) - 1] ?? ''
  );
}

export function t(key: MessageKey, ...subs: (string | number)[]): string {
  const values = subs.map(String);
  const entry = tables[current][key] ?? tables.en[key];
  return fill(entry.message, values);
}

export function isDefaultStepLabel(label: string, index: number): boolean {
  return LANGUAGES.some(
    language =>
      fill(tables[language].step_default_label.message, [String(index + 1)]) ===
      label
  );
}
