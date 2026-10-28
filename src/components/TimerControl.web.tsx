import { useEffect, useLayoutEffect, useState } from 'react';
import { TimerInput, withTimerFeedback } from '../utils/timerInput';
import { guardPointerClick } from '../utils/pointerClick.web';
import { playTimerBeep } from '../utils/timerBeep';
import type { TimerProps } from './TimerControl';

export default function TimerControl({ label, onActivate, size = 216 }: TimerProps) {
  const [gate] = useState(() => new TimerInput(withTimerFeedback(onActivate, playTimerBeep)));
  useLayoutEffect(() => {
    gate.setActivate(withTimerFeedback(onActivate, playTimerBeep));
  }, [onActivate, gate]);
  useEffect(() => () => gate.cancel(), [gate]);
  return (
    <button
      className='timer-control'
      style={{ width: size, minHeight: size, height: size, borderRadius: size / 2 }}
      type='button'
      aria-label={label}
      onPointerDown={(event) => {
        const at = performance.now();
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        event.stopPropagation();
        guardPointerClick();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        gate.pointerDown(event.pointerId, event.isPrimary, event.button, at);
      }}
      onPointerUp={(event) => {
        event.preventDefault();
        event.stopPropagation();
        gate.pointerUp(event.pointerId);
      }}
      onPointerCancel={(event) => gate.pointerUp(event.pointerId)}
      onLostPointerCapture={(event) => gate.pointerUp(event.pointerId)}
      onKeyDown={(event) => {
        const at = performance.now();
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          gate.keyDown(event.key, event.repeat, at);
        }
      }}
      onKeyUp={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          gate.keyUp(event.key);
        }
      }}
      onBlur={() => gate.cancel()}
      onClick={(event) => {
        const at = performance.now();
        event.preventDefault();
        event.stopPropagation();
        gate.click('PointerEvent' in window ? event.detail : 0, at);
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {label}
    </button>
  );
}
