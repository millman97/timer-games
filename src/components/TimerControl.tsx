import { useEffect, useLayoutEffect, useState } from 'react';
import { Platform, Pressable, Text } from 'react-native';
import { playTimerBeep } from '../utils/timerBeep';
import { TimerInput, withTimerFeedback } from '../utils/timerInput';
import styles from './styles';

export type TimerProps = { label: string; onActivate: (at?: number) => void; size?: number };
export default function TimerControl({ label, onActivate, size = 216 }: TimerProps) {
  const [gate] = useState(() => new TimerInput(withTimerFeedback(onActivate, playTimerBeep)));
  useLayoutEffect(() => {
    gate.setActivate(withTimerFeedback(onActivate, playTimerBeep));
  }, [onActivate, gate]);
  useEffect(() => () => gate.cancel(), [gate]);
  return (
    <Pressable
      accessible
      accessibilityRole='button'
      accessibilityLabel={label}
      android_disableSound
      cancelable={false}
      style={[styles.timer, { width: size, minHeight: size, height: size, borderRadius: size / 2 }]}
      onTouchStart={(event) => {
        const at = performance.now();
        // Pressability delays onPressOut by at least 130 ms. Timing must use
        // physical touch boundaries, never that visual-feedback lifecycle.
        const { touches, changedTouches } = event.nativeEvent;
        if (touches.length !== 1) return;
        const touch = changedTouches[0];
        if (touch) gate.pointerDown(touch.identifier, true, 0, at);
      }}
      onTouchEnd={(event) => {
        for (const touch of event.nativeEvent.changedTouches) gate.pointerUp(touch.identifier);
      }}
      onTouchCancel={(event) => {
        for (const touch of event.nativeEvent.changedTouches) gate.pointerUp(touch.identifier);
      }}
      onAccessibilityTap={
        Platform.OS === 'ios' ? () => gate.click(0, performance.now()) : undefined
      }
      accessibilityActions={Platform.OS === 'android' ? [{ name: 'activate' }] : undefined}
      onAccessibilityAction={
        Platform.OS === 'android'
          ? (event) => {
              if (event.nativeEvent.actionName === 'activate') gate.click(0, performance.now());
            }
          : undefined
      }
    >
      <Text style={styles.timerText}>{label}</Text>
    </Pressable>
  );
}
