export type Theme = 'dark' | 'light';
export type Language = 'en' | 'ko';

export interface Settings {
  adminPort: number;
  port: number;
  responseDelay: number;
  /** Request bodies are read at this rate (KB/s, 1 KB = 1024 B); 0 = unthrottled. */
  uploadRateKbps: number;
  /** Largest accepted request body, in MiB. Larger requests get a 413. */
  maxBodyMB: number;
  autoSaveEndpoints: boolean;
  historyToast: boolean;
  theme: Theme;
  language: Language;
}

export const DEFAULT_SETTINGS: Settings = {
  adminPort: 4649,
  port: 4650,
  responseDelay: 0,
  uploadRateKbps: 0,
  maxBodyMB: 5,
  autoSaveEndpoints: true,
  historyToast: true,
  theme: 'dark',
  language: 'en',
};
