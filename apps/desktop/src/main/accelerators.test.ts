import type { Menu, MenuItem } from 'electron';
import { describe, expect, it } from 'vitest';
import { itemFor, matches, parseAccelerator } from './accelerators';
import { drawsOverlay, windowFrame } from './title-bar';

/** The menu's shortcuts with no menu bar, and the window's frame (docs/briefs/B1-title-bar.md). */

const press = (
  key: string,
  code: string,
  mods: Partial<Record<'control' | 'meta' | 'shift' | 'alt', boolean>> = {},
) => ({
  key,
  code,
  control: false,
  meta: false,
  shift: false,
  alt: false,
  ...mods,
});

describe('the menu’s shortcuts without a menu bar', () => {
  it('reads accelerators for each system', () => {
    expect(parseAccelerator('CmdOrCtrl+Shift+S', 'win32')).toEqual({
      control: true,
      meta: false,
      shift: true,
      alt: false,
      key: 'S',
    });
    expect(parseAccelerator('CmdOrCtrl+Z', 'darwin')).toMatchObject({ meta: true, control: false });
    expect(parseAccelerator('Shift+Cmd+Z', 'darwin')).toMatchObject({
      meta: true,
      shift: true,
      key: 'Z',
    });
    expect(parseAccelerator('F10', 'linux')).toMatchObject({ control: false, key: 'F10' });
    expect(parseAccelerator('Ctrl+Hyper+X', 'win32')).toBeNull();
  });

  it('matches a key press exactly, by the key’s place for letters and digits', () => {
    const save = parseAccelerator('CmdOrCtrl+S', 'win32')!;
    expect(matches(press('s', 'KeyS', { control: true }), save)).toBe(true);
    // Another keyboard layout's letter on the same key still matches; extra modifiers do not.
    expect(matches(press('ы', 'KeyS', { control: true }), save)).toBe(true);
    expect(matches(press('S', 'KeyS', { control: true, shift: true }), save)).toBe(false);
    expect(matches(press('s', 'KeyS'), save)).toBe(false);
    expect(
      matches(press('1', 'Digit1', { control: true }), parseAccelerator('CmdOrCtrl+1', 'win32')!),
    ).toBe(true);
    expect(matches(press('F12', 'F12'), parseAccelerator('F12', 'win32')!)).toBe(true);
  });

  it('finds the enabled item in the submenus, and runs nothing for a key no item has', () => {
    const item = (accelerator: string | undefined, enabled = true) =>
      ({ accelerator, enabled, visible: true }) as unknown as MenuItem;
    const newSlide = item('CmdOrCtrl+M');
    const disabled = item('CmdOrCtrl+P', false);
    const menu = {
      items: [
        {
          enabled: true,
          visible: true,
          submenu: { items: [item('CmdOrCtrl+N'), newSlide, disabled] },
        },
      ],
    } as unknown as Menu;
    expect(itemFor(menu, press('m', 'KeyM', { control: true }), 'win32')).toBe(newSlide);
    expect(itemFor(menu, press('p', 'KeyP', { control: true }), 'win32')).toBeNull();
    expect(itemFor(menu, press('q', 'KeyQ', { control: true }), 'win32')).toBeNull();
  });
});

describe('the window’s frame', () => {
  it('hides the title bar; the system’s buttons over our bar, or the traffic lights in it', () => {
    expect(windowFrame('win32', false)).toEqual({
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#f7f8fa', symbolColor: '#1d2026', height: 40 },
    });
    expect(windowFrame('linux', true)).toMatchObject({
      titleBarOverlay: { color: '#1f2227', symbolColor: '#e7e9ee', height: 40 },
    });
    expect(windowFrame('darwin', false)).toEqual({
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 14, y: 13 },
      titleBarOverlay: true,
    });
  });

  it('draws no overlay with no screen (Linux e2e, where Electron would crash making it)', () => {
    expect(windowFrame('linux', false, 'x11')).toHaveProperty('titleBarOverlay');
    expect(windowFrame('linux', false, 'headless')).toEqual({ titleBarStyle: 'hidden' });
    expect(windowFrame('win32', false, 'headless')).toEqual({ titleBarStyle: 'hidden' });
    expect(drawsOverlay('darwin', 'headless')).toBe(true);
    expect(drawsOverlay('linux', 'wayland')).toBe(true);
  });
});
