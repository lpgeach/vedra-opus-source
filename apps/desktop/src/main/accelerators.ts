/**
 * The menu's keyboard shortcuts without a menu bar (docs/briefs/B1-title-bar.md).
 * On Windows and Linux a window with its title bar hidden shows no menu bar, and
 * the system then passes no keys to the menu's accelerators (Ctrl+S and the rest
 * stopped working). So main matches each key press against the application
 * menu's items before the page sees it, and runs the item, as the menu bar did.
 * macOS keeps its own menu bar, where they work as always.
 */
import type { Input, Menu, MenuItem } from 'electron';

export interface Accelerator {
  control: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
  /** The key, upper-case for a letter: `S`, `1`, `F10`, `PLUS`. */
  key: string;
}

/** An Electron accelerator (`CmdOrCtrl+Shift+S`, `F10`), for `platform`. Null when it cannot be read. */
export function parseAccelerator(text: string, platform: NodeJS.Platform): Accelerator | null {
  const parts = text.split('+').map((part) => part.trim());
  // "Plus" is the key named so; a trailing "+" is an empty part.
  const key = parts.pop();
  if (!key) return null;
  const result: Accelerator = {
    control: false,
    meta: false,
    shift: false,
    alt: false,
    key: key.toUpperCase(),
  };
  for (const part of parts.map((each) => each.toLowerCase())) {
    if (part === 'cmdorctrl' || part === 'commandorcontrol') {
      if (platform === 'darwin') result.meta = true;
      else result.control = true;
    } else if (part === 'ctrl' || part === 'control') result.control = true;
    else if (part === 'cmd' || part === 'command' || part === 'meta' || part === 'super') {
      result.meta = true;
    } else if (part === 'shift') result.shift = true;
    else if (part === 'alt' || part === 'option' || part === 'altgr') result.alt = true;
    else return null;
  }
  return result;
}

/** The key a key press names, as accelerators name it: by its place for letters and digits. */
function keyOf(input: Pick<Input, 'key' | 'code'>): string {
  const letter = /^Key([A-Z])$/.exec(input.code);
  if (letter) return letter[1]!;
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(input.code);
  if (digit) return digit[1]!;
  if (input.key === '+') return 'PLUS';
  return input.key.toUpperCase();
}

/** Whether a key press is the accelerator. */
export function matches(
  input: Pick<Input, 'key' | 'code' | 'control' | 'meta' | 'shift' | 'alt'>,
  accelerator: Accelerator,
): boolean {
  return (
    input.control === accelerator.control &&
    input.meta === accelerator.meta &&
    input.shift === accelerator.shift &&
    input.alt === accelerator.alt &&
    keyOf(input) === accelerator.key
  );
}

/** A role item's own shortcut (Toggle Full Screen and the like), which Electron keeps internally. */
function roleAccelerator(item: MenuItem): string | null {
  const own = (item as MenuItem & { getDefaultRoleAccelerator?: () => string | undefined })
    .getDefaultRoleAccelerator;
  return typeof own === 'function' ? (own.call(item) ?? null) : null;
}

/** The enabled, visible menu item whose shortcut the key press is, searching submenus too. */
export function itemFor(
  menu: Pick<Menu, 'items'>,
  input: Pick<Input, 'key' | 'code' | 'control' | 'meta' | 'shift' | 'alt'>,
  platform: NodeJS.Platform,
): MenuItem | null {
  for (const item of menu.items) {
    if (!item.enabled || !item.visible) continue;
    if (item.submenu) {
      const found = itemFor(item.submenu, input, platform);
      if (found) return found;
      continue;
    }
    const text = item.accelerator ?? roleAccelerator(item);
    const accelerator = text ? parseAccelerator(String(text), platform) : null;
    if (accelerator && matches(input, accelerator)) return item;
  }
  return null;
}
