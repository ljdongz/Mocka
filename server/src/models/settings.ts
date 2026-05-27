export type Theme = 'dark' | 'light';
export type Language = 'en' | 'ko';

export interface Settings {
  adminPort: number;
  port: number;
  responseDelay: number;
  autoSaveEndpoints: boolean;
  historyToast: boolean;
  theme: Theme;
  language: Language;
}

export const DEFAULT_SETTINGS: Settings = {
  adminPort: 4649,
  port: 4650,
  responseDelay: 0,
  autoSaveEndpoints: true,
  historyToast: true,
  theme: 'dark',
  language: 'en',
};
