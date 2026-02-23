export interface Settings {
  port: string;
  responseDelay: string;
  autoSaveEndpoints: string;
  historyToast: string;
}

export const DEFAULT_SETTINGS: Settings = {
  port: '8080',
  responseDelay: '0',
  autoSaveEndpoints: 'true',
  historyToast: 'true',
};
