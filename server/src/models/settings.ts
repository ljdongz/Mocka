export type Theme = 'dark' | 'light';

export interface Settings {
  port: number;
  responseDelay: number;
  autoSaveEndpoints: boolean;
  historyToast: boolean;
  theme: Theme;
}

export const DEFAULT_SETTINGS: Settings = {
  port: 8080,
  responseDelay: 0,
  autoSaveEndpoints: true,
  historyToast: true,
  theme: 'dark',
};
