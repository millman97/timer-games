import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TimerInput, withTimerFeedback } from '../src/utils/timerInput.ts';
import { TIMER_TONE } from '../src/utils/timerTone.ts';
import {
  prepareTimerBeep as prepareWeb,
  playTimerBeep as playWeb,
} from '../src/utils/timerBeep.web.ts';
import {
  prepareTimerBeep as prepareNative,
  playTimerBeep as playNative,
} from '../src/utils/timerBeep.ts';

function webAudio({ suspended = false, reject = false } = {}) {
  const calls = [];
  const listeners = new Map();
  let resume;
  const audio = {
    currentTime: 5,
    state: suspended ? 'suspended' : 'running',
    destination: {},
    resume() {
      calls.push('resume');
      if (reject) return Promise.reject(new Error('Playback blocked'));
      return new Promise((resolve) => {
        resume = () => {
          audio.state = 'running';
          resolve();
        };
      });
    },
    close() {
      calls.push('close');
      audio.state = 'closed';
      return Promise.resolve();
    },
    createOscillator() {
      const oscillator = {
        frequency: { setValueAtTime: (...args) => calls.push(['frequency', ...args]) },
        connect() {},
        disconnect() {
          calls.push('disconnect oscillator');
        },
        start: (at) => calls.push(['start', at]),
        stop: (at) => calls.push(['stop', at]),
      };
      calls.push(oscillator);
      return oscillator;
    },
    createGain() {
      return {
        gain: {
          setValueAtTime: (...args) => calls.push(['gain', ...args]),
          linearRampToValueAtTime: (...args) => calls.push(['ramp', ...args]),
        },
        connect() {},
        disconnect() {
          calls.push('disconnect gain');
        },
      };
    },
  };
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  globalThis.window = {
    AudioContext: function () {
      calls.push('create context');
      return audio;
    },
  };
  globalThis.document = {
    visibilityState: 'visible',
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type),
  };
  const dispose = prepareWeb();
  return {
    calls,
    audio,
    listeners,
    resume: () => resume(),
    cleanup() {
      dispose();
      if (oldWindow === undefined) delete globalThis.window;
      else globalThis.window = oldWindow;
      if (oldDocument === undefined) delete globalThis.document;
      else globalThis.document = oldDocument;
    },
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('timer tap feedback', () => {
  it('captures gameplay before audio, and beeps once per deliberate rapid input including assistive activation', () => {
    const events = [];
    const gate = new TimerInput(
      withTimerFeedback(
        (at) => events.push(['timer', at]),
        () => events.push('beep'),
      ),
    );
    gate.pointerDown(1, true, 0, 100);
    gate.pointerDown(1, true, 0, 100.1);
    gate.pointerDown(2, false, 0, 100.2);
    gate.click(1, 100.3);
    gate.pointerUp(1);
    gate.pointerDown(3, true, 0, 101);
    gate.pointerUp(3);
    gate.keyDown(' ', false, 102);
    gate.keyDown(' ', true, 103);
    gate.click(0, 103);
    gate.keyUp(' ');
    gate.click(0, 104);
    assert.deepEqual(events, [
      ['timer', 100],
      'beep',
      ['timer', 101],
      'beep',
      ['timer', 102],
      'beep',
      ['timer', 104],
      'beep',
    ]);
  });
  it('does not let an unavailable audio device interrupt timing', () => {
    const timestamps = [];
    const activate = withTimerFeedback(
      (at) => timestamps.push(at),
      () => {
        throw new Error('No audio device');
      },
    );
    assert.doesNotThrow(() => {
      activate(1);
      activate(2);
    });
    assert.deepEqual(timestamps, [1, 2]);
  });
});

describe('web beep with fully mocked Web Audio', () => {
  it('creates a single context and independent finite chirps for rapid presses, without recurring timers', () => {
    const h = webAudio();
    try {
      assert.equal(h.calls.length, 0); // No playback/autoplay during app setup.
      playWeb();
      playWeb();
      assert.equal(h.calls.filter((call) => call === 'create context').length, 1);
      assert.equal(h.calls.filter((call) => Array.isArray(call) && call[0] === 'start').length, 2);
      assert.deepEqual(
        h.calls.filter((call) => Array.isArray(call) && call[0] === 'stop'),
        [
          ['stop', 5 + TIMER_TONE.duration],
          ['stop', 5 + TIMER_TONE.duration],
        ],
      );
      assert.deepEqual(
        h.calls.find((call) => Array.isArray(call) && call[0] === 'frequency'),
        ['frequency', TIMER_TONE.frequency, 5],
      );
      const oscillator = h.calls.find((call) => typeof call === 'object' && call.start);
      assert.equal(oscillator.type, 'square');
      oscillator.onended();
      assert.ok(h.calls.includes('disconnect oscillator'));
      assert.ok(h.calls.includes('disconnect gain'));
    } finally {
      h.cleanup();
    }
  });
  it('unlocks audio from the press and suppresses a pending beep after backgrounding', async () => {
    const h = webAudio({ suspended: true });
    try {
      playWeb();
      assert.ok(h.calls.includes('resume'));
      globalThis.document.visibilityState = 'hidden';
      h.listeners.get('visibilitychange')();
      globalThis.document.visibilityState = 'visible';
      h.resume();
      await flush();
      assert.equal(h.calls.filter((call) => Array.isArray(call) && call[0] === 'start').length, 0);
      playWeb();
      assert.equal(h.calls.filter((call) => Array.isArray(call) && call[0] === 'start').length, 1);
    } finally {
      h.cleanup();
    }
  });
  it('tolerates autoplay rejection, missing support, and server-side rendering', async () => {
    const h = webAudio({ suspended: true, reject: true });
    try {
      assert.doesNotThrow(playWeb);
      await flush();
      assert.equal(h.calls.filter((call) => Array.isArray(call) && call[0] === 'start').length, 0);
    } finally {
      h.cleanup();
    }
    assert.doesNotThrow(playWeb);
    const unsupported = webAudio();
    try {
      delete globalThis.window.AudioContext;
      assert.doesNotThrow(playWeb);
    } finally {
      unsupported.cleanup();
    }
  });
});

describe('native beep with fully mocked Expo Audio', () => {
  it('preloads once at app scope, rewinds for each press, and releases on app cleanup', async () => {
    const events = [];
    const audio = {
      seekTo: (value) => {
        events.push(['seek', value]);
        return Promise.resolve();
      },
      play: () => events.push('play'),
      release: () => events.push('release'),
    };
    globalThis.__testAudio = {
      createAudioPlayer: (source, options) => {
        events.push(['create', source, options]);
        return audio;
      },
      setAudioModeAsync: (mode) => {
        events.push(['mode', mode]);
        return Promise.resolve();
      },
    };
    const dispose = prepareNative(123);
    try {
      assert.equal(audio.loop, false);
      playNative();
      playNative();
      await flush();
      assert.equal(events.filter((event) => event === 'play').length, 2);
      assert.deepEqual(
        events.filter((event) => Array.isArray(event) && event[0] === 'seek'),
        [
          ['seek', 0],
          ['seek', 0],
        ],
      );
      assert.equal(
        events.filter((event) => Array.isArray(event) && event[0] === 'create').length,
        1,
      );
      assert.equal(events.find((event) => event[0] === 'mode')[1].shouldPlayInBackground, false);
      dispose();
      playNative();
      await flush();
      assert.equal(events.filter((event) => event === 'play').length, 2);
      assert.ok(events.includes('release'));
    } finally {
      delete globalThis.__testAudio;
    }
  });
  it('swallows rejected playback and never plays a pending seek after cleanup', async () => {
    let resolveSeek,
      played = 0;
    const audio = {
      seekTo: () =>
        new Promise((resolve) => {
          resolveSeek = resolve;
        }),
      play: () => played++,
      release() {},
    };
    globalThis.__testAudio = {
      createAudioPlayer: () => audio,
      setAudioModeAsync: () => Promise.reject(new Error('Unavailable')),
    };
    const dispose = prepareNative(123);
    try {
      playNative();
      dispose();
      resolveSeek();
      await flush();
      assert.equal(played, 0);
      const disposeAgain = prepareNative(123);
      audio.seekTo = () => Promise.reject(new Error('Unavailable'));
      assert.doesNotThrow(playNative);
      await flush();
      assert.equal(played, 0);
      disposeAgain();
    } finally {
      delete globalThis.__testAudio;
    }
  });
});
