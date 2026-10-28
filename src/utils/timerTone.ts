// One short digital stopwatch chirp, identical for every timer activation.
export const TIMER_TONE = {
  frequency: 2400,
  duration: 0.065,
  attack: 0.002,
  release: 0.006,
  volume: 0.1,
} as const;
