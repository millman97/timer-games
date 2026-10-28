// Keep the click belonging to a timer gesture from falling onto a newly mounted
// handoff control. A new physical gesture clears the guard; no time debounce.
export function guardPointerClick(target: Document = document) {
  const cleanup = () => {
    target.removeEventListener('click', click, true);
    target.removeEventListener('pointerdown', nextGesture, true);
  };
  const click = (event: MouseEvent) => {
    if (event.detail > 0) {
      event.preventDefault();
      event.stopImmediatePropagation();
      cleanup();
    }
  };
  const nextGesture = (event: PointerEvent) => {
    if (event.isPrimary) cleanup();
  };
  target.addEventListener('click', click, true);
  target.addEventListener('pointerdown', nextGesture, true);
}
