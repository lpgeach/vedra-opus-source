import { createEmptyProject, presetOf } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings, settingsSchema } from './settings';

describe('parseSettings', () => {
  it('returns the defaults for anything that is not a settings object', () => {
    for (const raw of [undefined, null, 'nonsense', 42, []]) {
      expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('round-trips valid settings unchanged', () => {
    const settings = {
      theme: 'dark',
      layout: {
        left: { size: 301, collapsed: true },
        right: { size: 412, collapsed: false },
        bottom: { size: 150, collapsed: true },
        leftTab: 'media',
        bottomTab: 'notes',
      },
      view: {
        rulers: true,
        grid: true,
        guides: false,
        snap: false,
        gridSize: 40,
        guideX: [120, 780],
        guideY: [200],
        // Since B2.
        offSlide: 'dim',
      },
      // Since P8.3.
      playerPresets: [presetOf(createEmptyProject().player, 'Mine')],
      // Since P11.5.
      keepCrashReports: true,
      // Since P11.4 part B.
      updates: { automatic: true, channel: 'beta' },
    };
    expect(parseSettings(JSON.parse(JSON.stringify(settings)))).toEqual(settings);
  });

  it('checks no updates automatically, on Stable, for an older settings file or damaged values', () => {
    expect(parseSettings({ theme: 'dark' }).updates).toEqual({
      automatic: false,
      channel: 'stable',
    });
    expect(parseSettings({ updates: { automatic: 'yes', channel: 'nightly' } }).updates).toEqual({
      automatic: false,
      channel: 'stable',
    });
    expect(parseSettings({ updates: { automatic: true, channel: 'beta' } }).updates).toEqual({
      automatic: true,
      channel: 'beta',
    });
  });

  it('keeps no crash reports for a settings file from before they could be kept, or a damaged value', () => {
    expect(parseSettings({ theme: 'dark' }).keepCrashReports).toBe(false);
    expect(parseSettings({ keepCrashReports: 'yes' }).keepCrashReports).toBe(false);
    expect(parseSettings({ keepCrashReports: true }).keepCrashReports).toBe(true);
  });

  it('keeps the view settings it can use and defaults the rest', () => {
    const parsed = parseSettings({
      view: { grid: true, gridSize: 0, guideX: [100, 100, 300], guideY: 'no', snap: 'yes' },
    });
    expect(parsed.view.grid).toBe(true);
    expect(parsed.view.gridSize).toBe(DEFAULT_SETTINGS.view.gridSize);
    expect(parsed.view.guideX).toEqual([100, 100, 300]);
    expect(parsed.view.guideY).toEqual([]);
    expect(parsed.view.snap).toBe(DEFAULT_SETTINGS.view.snap);
    expect(parsed.view.rulers).toBe(DEFAULT_SETTINGS.view.rulers);
    expect(parsed.view.guides).toBe(DEFAULT_SETTINGS.view.guides);
  });

  it('dims objects past the slide for a settings file from before B2, or a damaged value', () => {
    expect(DEFAULT_SETTINGS.view.offSlide).toBe('dim');
    expect(parseSettings({ view: { grid: true } }).view.offSlide).toBe('dim');
    expect(parseSettings({ view: { offSlide: 'blur' } }).view.offSlide).toBe('dim');
    expect(parseSettings({ view: { offSlide: 'hide' } }).view.offSlide).toBe('hide');
    expect(parseSettings({ view: { offSlide: 'show' } }).view.offSlide).toBe('show');
  });

  it('replaces only the parts it cannot use', () => {
    const parsed = parseSettings({
      theme: 'sepia',
      layout: {
        left: { size: 333, collapsed: false },
        right: { size: 'wide', collapsed: false },
        bottomTab: 'states',
      },
    });
    expect(parsed.theme).toBe('system');
    expect(parsed.layout.left).toEqual({ size: 333, collapsed: false });
    expect(parsed.layout.right).toEqual(DEFAULT_SETTINGS.layout.right);
    expect(parsed.layout.bottom).toEqual(DEFAULT_SETTINGS.layout.bottom);
    expect(parsed.layout.leftTab).toBe('slides');
    expect(parsed.layout.bottomTab).toBe('states');
  });

  it('never hands out the shared defaults object for a caller to mutate', () => {
    const parsed = parseSettings(null);
    expect(parsed).not.toBe(DEFAULT_SETTINGS);
    expect(parsed.layout.left).not.toBe(DEFAULT_SETTINGS.layout.left);
    expect(parsed.view).not.toBe(DEFAULT_SETTINGS.view);
    expect(parsed.view.guideX).not.toBe(DEFAULT_SETTINGS.view.guideX);
  });

  it('keeps player presets, dropping only a damaged one (P8.3)', () => {
    const good = presetOf(createEmptyProject().player, 'House style');
    const parsed = parseSettings({ ...DEFAULT_SETTINGS, playerPresets: [good, { name: 7 }] });
    expect(parsed.playerPresets).toEqual([good]);
    expect(settingsSchema.safeParse(parsed).success).toBe(true);
    expect(
      parseSettings({ ...DEFAULT_SETTINGS, playerPresets: 'all of them' }).playerPresets,
    ).toEqual([]);
    // Settings written before P8.3 have none.
    const { playerPresets: _none, ...older } = DEFAULT_SETTINGS;
    expect(parseSettings(older).playerPresets).toEqual([]);
  });

  it('always produces something the strict IPC schema accepts', () => {
    for (const raw of [null, {}, { layout: 7 }, { theme: 'dark', layout: { left: null } }]) {
      expect(settingsSchema.safeParse(parseSettings(raw)).success).toBe(true);
    }
  });
});
