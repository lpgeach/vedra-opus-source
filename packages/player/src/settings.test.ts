import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings';
import type { SettingsStore } from './settings';

/** The learner's remembered settings (docs/briefs/P10.1-accessibility.md, part C). */

const memory = (): SettingsStore & { items: Map<string, string> } => {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
};

describe('the learner’s settings', () => {
  it('start as the defaults, and come back as they were saved, for that course only', () => {
    const store = memory();
    expect(loadSettings(store, 'proj_a')).toEqual(DEFAULT_SETTINGS);
    const chosen = { captionSize: 'larger' as const, textView: true, textSize: 175 };
    saveSettings(store, 'proj_a', chosen);
    expect(loadSettings(store, 'proj_a')).toEqual(chosen);
    expect(loadSettings(store, 'proj_b')).toEqual(DEFAULT_SETTINGS);
  });

  it('take the default for anything missing, unknown or not ours', () => {
    const store = memory();
    store.items.set(
      'vedraopus-player:proj_a',
      JSON.stringify({ captionSize: 'huge', textView: 'yes', textSize: 130 }),
    );
    expect(loadSettings(store, 'proj_a')).toEqual(DEFAULT_SETTINGS);
    store.items.set('vedraopus-player:proj_a', '{not json');
    expect(loadSettings(store, 'proj_a')).toEqual(DEFAULT_SETTINGS);
    store.items.set('vedraopus-player:proj_a', JSON.stringify({ textView: true }));
    expect(loadSettings(store, 'proj_a')).toEqual({ ...DEFAULT_SETTINGS, textView: true });
  });

  it('last for the visit when storage is refused or missing', () => {
    const refusing: SettingsStore = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(() => saveSettings(refusing, 'proj_a', DEFAULT_SETTINGS)).not.toThrow();
    expect(loadSettings(refusing, 'proj_a')).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null, 'proj_a')).toEqual(DEFAULT_SETTINGS);
  });
});
