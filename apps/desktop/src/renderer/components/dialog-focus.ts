/**
 * Give a dialog the focus as it opens (pass as its `ref`, with `tabIndex={-1}`),
 * unless something inside it has it already. Otherwise the focus stays on the
 * button that opened it: keyboard users start outside the dialog, and its keys
 * (Escape to close) never reach it.
 */
export function takeFocus(element: HTMLElement | null): void {
  if (element && !element.contains(document.activeElement)) element.focus();
}
