import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TimerControl from '../src/components/TimerControl.tsx';
import { GameStore } from '../src/stores/GameStore.ts';
import { currentId, DEFAULT_CONFIGS } from '../src/model/game.ts';

// Render only through fully mocked native primitives; no device/browser or timer waits.
function control(onActivate, platform = 'ios') {
  globalThis.__testNativeElements = [];
  globalThis.__testPlatform = platform;
  try {
    renderToStaticMarkup(React.createElement(TimerControl, { label: 'Start', onActivate }));
    return globalThis.__testNativeElements.find((props) => props.accessibilityRole === 'button');
  } finally {
    delete globalThis.__testNativeElements;
    delete globalThis.__testPlatform;
  }
}
const touch = (id, remaining, changed = [id]) => ({
  nativeEvent: {
    identifier: id,
    touches: remaining.map((identifier) => ({ identifier })),
    changedTouches: changed.map((identifier) => ({ identifier })),
  },
});
// Pressability's visual press-out callback has not fired inside the 130 ms window.
// Raw touch events still occur immediately. Drive both routes to reproduce the old bug.
const down = (props, event) => {
  props.onPressIn?.(event);
  props.onTouchStart?.(event);
};
const up = (props, event) => {
  props.onTouchEnd?.(event);
};
function engineFor(mode) {
  const engine = new GameStore(
    {
      read: () => null,
      write() {
        throw Error('Session only');
      },
      clear() {},
    },
    () => 0,
    () => 0.7,
  );
  engine.load();
  engine.update({
    ...engine.getSnapshot().data,
    roster: Array.from({ length: 3 }, (_, index) => ({
      id: `player-${index + 1}`,
      name: `Player ${index + 1}`,
    })),
  });
  engine.startMatch('rapid', DEFAULT_CONFIGS[mode]);
  engine.dispatch({ type: 'READY' });
  return engine;
}

describe('native timer physical input', () => {
  it('completes all five Time Rush targets with ten separate taps inside 100 ms', (t) => {
    let now = 0;
    t.mock.method(performance, 'now', () => now);
    const engine = engineFor('rush');
    const props = control(engine.activate);
    for (let index = 0; index < 5; index++) {
      now = index * 20;
      down(props, touch(0, [0]));
      now += 1;
      up(props, touch(0, []));
      now += 9;
      down(props, touch(0, [0]));
      now += 1;
      up(props, touch(0, []));
    }
    const match = engine.getSnapshot().data.match;
    assert.equal(match.phase.kind, 'saved');
    assert.deepEqual(match.rushAttempts[currentId(match)], [10, 10, 10, 10, 10]);
    assert.equal(match.scores[currentId(match)], 14950);
  });

  it('accepts two taps 20 ms apart without waiting for Pressability’s 130 ms press-out feedback', (t) => {
    let now = 100;
    t.mock.method(performance, 'now', () => now);
    const engine = engineFor('under');
    const accepted = [];
    const props = control((at) => {
      accepted.push(at);
      engine.activate(at);
    });
    down(props, touch(0, [0]));
    now = 105;
    up(props, touch(0, []));
    // Same touch ID reused by the next tap; no onPressOut has fired yet.
    now = 120;
    down(props, touch(0, [0]));
    now = 125;
    up(props, touch(0, []));
    assert.deepEqual(accepted, [100, 120]);
    assert.equal(engine.getSnapshot().data.match.phase.kind, 'saved');
    assert.equal(engine.getSnapshot().data.match.totalMs, 20);
  });
  it('finishes all three increments using six taps inside the old 130 ms delay window', (t) => {
    let now = 0;
    t.mock.method(performance, 'now', () => now);
    const engine = engineFor('increments');
    const accepted = [];
    const props = control((at) => {
      accepted.push(at);
      engine.activate(at);
    });
    for (const at of [0, 10, 20, 30, 40, 50]) {
      now = at;
      down(props, touch(0, [0]));
      now = at + 1;
      up(props, touch(0, []));
    }
    const m = engine.getSnapshot().data.match;
    assert.deepEqual(accepted, [0, 10, 20, 30, 40, 50]);
    assert.equal(m.phase.kind, 'saved');
    assert.equal(m.attempts[currentId(m)], 30);
  });
  it('ignores held gestures and additional fingers without releasing the active finger early', () => {
    let count = 0;
    const props = control(() => count++);
    down(props, touch(1, [1]));
    down(props, touch(1, [1]));
    down(props, touch(2, [1, 2]));
    up(props, touch(2, [1]));
    down(props, touch(3, [1, 3]));
    assert.equal(count, 1);
    up(props, touch(1, [3]));
    down(props, touch(4, [3, 4]));
    assert.equal(count, 1);
    up(props, touch(3, [4]));
    up(props, touch(4, []));
    down(props, touch(0, [0]));
    assert.equal(count, 2);
  });
  it('releases a cancelled touch immediately so the next tap is accepted', () => {
    let count = 0;
    const props = control(() => count++);
    down(props, touch(5, [5]));
    props.onTouchCancel(touch(5, []));
    down(props, touch(5, [5]));
    assert.equal(count, 2);
  });
  for (const platform of ['ios', 'android']) {
    it(`keeps ${platform} assistive activation separate from physical touch feedback`, () => {
      let count = 0;
      const props = control(() => count++, platform);
      const activate = () =>
        platform === 'ios'
          ? props.onAccessibilityTap()
          : props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } });
      activate();
      activate();
      assert.equal(count, 2);
      down(props, touch(1, [1]));
      activate(); // An assistive click cannot duplicate a physical touch in progress.
      assert.equal(count, 3);
      up(props, touch(1, []));
      activate();
      assert.equal(count, 4);
    });
  }
});
