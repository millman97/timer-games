// One physical gesture has exactly one accepted activation. No time debounce.
export class TimerInput {
  private pointer: number | null = null;
  private key: string | null = null;
  constructor(private activate: (at?: number) => void) {}
  setActivate(activate: (at?: number) => void) {
    this.activate = activate;
  }
  pointerDown(id: number, primary = true, button = 0, at?: number) {
    if (!primary || button !== 0 || this.pointer !== null || this.key !== null) return;
    this.pointer = id;
    this.activate(at);
  }
  pointerUp(id: number) {
    if (this.pointer === id) this.pointer = null;
  }
  keyDown(key: string, repeat: boolean, at?: number) {
    if (![' ', 'Enter'].includes(key) || repeat || this.key !== null || this.pointer !== null)
      return;
    this.key = key;
    this.activate(at);
  }
  keyUp(key: string) {
    if (this.key === key) this.key = null;
  }
  click(detail: number, at?: number) {
    // Pointer and keyboard generated clicks are suppressed. detail=0 with no
    // held key/pointer is the explicit assistive-technology activation path.
    if (detail === 0 && this.key === null && this.pointer === null) this.activate(at);
  }
  cancel() {
    this.pointer = null;
    this.key = null;
  }
}

// Timing runs first using the captured event timestamp. Sound is optional feedback.
export function withTimerFeedback(activate: (at?: number) => void, beep: () => void) {
  return (at?: number) => {
    activate(at);
    try {
      beep();
    } catch {
      /* Audio failure must not affect input. */
    }
  };
}
