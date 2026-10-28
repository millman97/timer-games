import { TIMER_TONE } from './timerTone';

let context: AudioContext | null = null;
let generation = 0;

// Create/resume only from the timer's deliberate input event (Safari autoplay policy).
export function playTimerBeep() {
  try {
    if (typeof window === 'undefined' || document.visibilityState === 'hidden') return;
    const AudioContextClass =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    if (!context || context.state === 'closed')
      context = new AudioContextClass({ latencyHint: 'interactive' });
    const audio = context;
    const currentGeneration = generation;
    const sound = () => {
      // Never replay a delayed chirp after backgrounding or releasing the app.
      if (
        generation !== currentGeneration ||
        audio.state !== 'running' ||
        document.visibilityState === 'hidden'
      )
        return;
      const start = audio.currentTime;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(TIMER_TONE.frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(TIMER_TONE.volume, start + TIMER_TONE.attack);
      gain.gain.setValueAtTime(TIMER_TONE.volume, start + TIMER_TONE.duration - TIMER_TONE.release);
      gain.gain.linearRampToValueAtTime(0, start + TIMER_TONE.duration);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(start + TIMER_TONE.duration);
    };
    if (audio.state === 'running') sound();
    else
      void audio
        .resume()
        .then(sound)
        .catch(() => {});
  } catch {
    // Optional feedback must never interrupt gameplay.
  }
}

export function prepareTimerBeep() {
  const hidden = () => {
    if (document.visibilityState === 'hidden') generation++;
  };
  document.addEventListener('visibilitychange', hidden);
  return () => {
    document.removeEventListener('visibilitychange', hidden);
    generation++;
    const audio = context;
    context = null;
    if (audio && audio.state !== 'closed') void audio.close().catch(() => {});
  };
}
