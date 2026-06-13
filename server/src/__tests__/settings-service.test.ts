import { describe, it, expect, beforeEach } from 'vitest';

import * as settingsService from '../services/settings.service.js';
import { initDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';

describe('settings.service update() validation', () => {
  beforeEach(() => {
    initDb(':memory:');
    initSchema();
  });

  describe('defaults', () => {
    it('returns seeded/default settings before any update', () => {
      const settings = settingsService.getAll();
      expect(settings.port).toBe(4650);
      expect(settings.adminPort).toBe(4649);
      expect(settings.responseDelay).toBe(0);
    });
  });

  describe('port validation', () => {
    it('persists a valid port', () => {
      settingsService.update({ port: 5000 });
      expect(settingsService.getAll().port).toBe(5000);
    });

    it('accepts boundary value 1', () => {
      settingsService.update({ port: 1 });
      expect(settingsService.getAll().port).toBe(1);
    });

    it('accepts boundary value 65535', () => {
      settingsService.update({ port: 65535 });
      expect(settingsService.getAll().port).toBe(65535);
    });

    it('rejects 0 (below range) and keeps the previous value', () => {
      settingsService.update({ port: 0 });
      expect(settingsService.getAll().port).toBe(4650);
    });

    it('rejects -1 (negative) and keeps the previous value', () => {
      settingsService.update({ port: -1 });
      expect(settingsService.getAll().port).toBe(4650);
    });

    it('rejects 70000 (above range) and keeps the previous value', () => {
      settingsService.update({ port: 70000 });
      expect(settingsService.getAll().port).toBe(4650);
    });

    it('rejects 65536 (one above max) and keeps the previous value', () => {
      settingsService.update({ port: 65536 });
      expect(settingsService.getAll().port).toBe(4650);
    });

    it('rejects a non-integer (3.5) and keeps the previous value', () => {
      settingsService.update({ port: 3.5 });
      expect(settingsService.getAll().port).toBe(4650);
    });

    it('rejects NaN and keeps the previous value', () => {
      settingsService.update({ port: NaN });
      expect(settingsService.getAll().port).toBe(4650);
    });

    it('keeps the most recently persisted valid value when a later invalid update is dropped', () => {
      settingsService.update({ port: 5000 });
      expect(settingsService.getAll().port).toBe(5000);

      settingsService.update({ port: 70000 });
      // invalid update dropped — previous valid value (5000) preserved
      expect(settingsService.getAll().port).toBe(5000);
    });
  });

  describe('adminPort validation', () => {
    it('persists a valid adminPort', () => {
      settingsService.update({ adminPort: 6000 });
      expect(settingsService.getAll().adminPort).toBe(6000);
    });

    it('accepts boundary value 1', () => {
      settingsService.update({ adminPort: 1 });
      expect(settingsService.getAll().adminPort).toBe(1);
    });

    it('accepts boundary value 65535', () => {
      settingsService.update({ adminPort: 65535 });
      expect(settingsService.getAll().adminPort).toBe(65535);
    });

    it('rejects 0 and keeps the previous value (default 4649)', () => {
      settingsService.update({ adminPort: 0 });
      expect(settingsService.getAll().adminPort).toBe(4649);
    });

    it('rejects -1 and keeps the previous value', () => {
      settingsService.update({ adminPort: -1 });
      expect(settingsService.getAll().adminPort).toBe(4649);
    });

    it('rejects 70000 and keeps the previous value', () => {
      settingsService.update({ adminPort: 70000 });
      expect(settingsService.getAll().adminPort).toBe(4649);
    });

    it('rejects a non-integer (3.5) and keeps the previous value', () => {
      settingsService.update({ adminPort: 3.5 });
      expect(settingsService.getAll().adminPort).toBe(4649);
    });

    it('rejects NaN and keeps the previous value', () => {
      settingsService.update({ adminPort: NaN });
      expect(settingsService.getAll().adminPort).toBe(4649);
    });
  });

  describe('responseDelay clamping', () => {
    it('persists a valid non-negative value', () => {
      settingsService.update({ responseDelay: 250 });
      expect(settingsService.getAll().responseDelay).toBe(250);
    });

    it('persists 0', () => {
      settingsService.update({ responseDelay: 500 });
      expect(settingsService.getAll().responseDelay).toBe(500);

      settingsService.update({ responseDelay: 0 });
      expect(settingsService.getAll().responseDelay).toBe(0);
    });

    it('clamps a negative value to 0', () => {
      settingsService.update({ responseDelay: 500 });
      expect(settingsService.getAll().responseDelay).toBe(500);

      settingsService.update({ responseDelay: -100 });
      expect(settingsService.getAll().responseDelay).toBe(0);
    });

    it('clamps NaN (non-finite) to 0', () => {
      settingsService.update({ responseDelay: 500 });
      settingsService.update({ responseDelay: NaN });
      expect(settingsService.getAll().responseDelay).toBe(0);
    });

    it('clamps Infinity (non-finite) to 0', () => {
      settingsService.update({ responseDelay: Infinity });
      expect(settingsService.getAll().responseDelay).toBe(0);
    });
  });

  describe('non-port fields are unaffected', () => {
    it('persists theme normally', () => {
      settingsService.update({ theme: 'light' });
      expect(settingsService.getAll().theme).toBe('light');
    });

    it('persists language normally', () => {
      settingsService.update({ language: 'ko' });
      expect(settingsService.getAll().language).toBe('ko');
    });

    it('persists autoSaveEndpoints normally', () => {
      settingsService.update({ autoSaveEndpoints: false });
      expect(settingsService.getAll().autoSaveEndpoints).toBe(false);
    });

    it('persists historyToast normally', () => {
      settingsService.update({ historyToast: false });
      expect(settingsService.getAll().historyToast).toBe(false);
    });

    it('persists non-port fields even when an invalid port is dropped in the same update', () => {
      settingsService.update({ port: 70000, theme: 'light', language: 'ko' });
      const settings = settingsService.getAll();
      // invalid port dropped, defaults preserved
      expect(settings.port).toBe(4650);
      // sibling fields still persisted
      expect(settings.theme).toBe('light');
      expect(settings.language).toBe('ko');
    });
  });
});
