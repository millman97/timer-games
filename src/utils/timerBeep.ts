import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer, AudioSource } from 'expo-audio';

let player: AudioPlayer | null = null;

export function prepareTimerBeep(
  source: AudioSource = require('../../assets/sounds/timer-beep.wav'),
) {
  try {
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
    }).catch(() => {});
    const audio = createAudioPlayer(source, { updateInterval: 1000 });
    audio.loop = false;
    player = audio;
    return () => {
      if (player === audio) player = null;
      audio.release();
    };
  } catch {
    return () => {};
  }
}

export function playTimerBeep() {
  const audio = player;
  if (!audio) return;
  try {
    // Retrigger the same preloaded clip, including after it has finished playing.
    // Never wait for audio before accepting the timer input.
    void audio
      .seekTo(0)
      .then(() => {
        if (player === audio) audio.play();
      })
      .catch(() => {});
  } catch {
    // Audio is optional: unsupported/muted playback cannot affect the game.
  }
}
