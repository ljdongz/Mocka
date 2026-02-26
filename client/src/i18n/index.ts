import en from './en';
import ko from './ko';
import type { Translations } from './en';
import type { Language } from '../types';
import { useSettingsStore } from '../stores/settings.store';

const translations: Record<Language, Translations> = { en, ko };

export function useTranslation(): Translations {
  const language = useSettingsStore(s => s.settings.language);
  return translations[language] ?? translations.en;
}

export function fmt(template: string, ...args: (string | number)[]): string {
  return args.reduce<string>((s, arg, i) => s.replace(`{${i}}`, String(arg)), template);
}

export type { Translations };
