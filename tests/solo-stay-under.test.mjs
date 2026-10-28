import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMatch, DEFAULT_CONFIGS, minimumPlayers, transition } from '../src/model/game.ts';
import { decodeSnapshot, emptySnapshot, validMatch } from '../src/utils/snapshot.ts';
import { game } from '../src/stores/game.ts';
import GameScreen from '../src/screens/GameScreen/GameScreen.tsx';
import SetupScreen from '../src/screens/SetupScreen/SetupScreen.tsx';

const solo = [{ id: 'a', name: 'Alex' }];
const players = [...solo, { id: 'b', name: 'Sam' }, { id: 'c', name: 'Charlie' }];
const random = () => 0.5;
const act = (match, type, extra = {}) => transition(match, { type, ...extra }, random);
const turn = (match, elapsed) => act(act(act(match, 'READY'), 'START'), 'STOP', { elapsed });
const fresh = (lives = 3) =>
  createMatch(
    'solo-under',
    { ...DEFAULT_CONFIGS.under, minTargetMs: 1000, maxTargetMs: 1000, lives },
    solo,
    random,
  );
const reload = (match) =>
  decodeSnapshot(JSON.stringify({ ...emptySnapshot(), roster: solo, match })).match;
function render(Component, match = null) {
  game.load();
  game.update({ ...emptySnapshot(), roster: solo, match });
  globalThis.__testParams = { mode: 'under' };
  try {
    return renderToStaticMarkup(React.createElement(Component)).replace(/<!--.*?-->/g, '');
  } finally {
    delete globalThis.__testParams;
  }
}

describe('mode-specific player minimums and solo Stay Under', () => {
  it('requires three for Imposter, two for Closest modes, and one for Stay Under and Rush', () => {
    for (const [mode, minimum] of [
      ['imposter', 3],
      ['closest', 2],
      ['increments', 2],
      ['under', 1],
      ['rush', 1],
    ]) {
      assert.equal(minimumPlayers(mode), minimum);
      assert.throws(
        () => createMatch('too-few', DEFAULT_CONFIGS[mode], players.slice(0, minimum - 1), random),
        new RegExp(`Choose ${minimum}–12 players`),
      );
      assert.equal(
        validMatch(
          createMatch('minimum', DEFAULT_CONFIGS[mode], players.slice(0, minimum), random),
        ),
        true,
      );
    }
  });

  it('can start solo Stay Under from setup with no handoff to another player', () => {
    globalThis.__testNativeElements = [];
    try {
      assert.match(render(SetupScreen), /1 player</);
      const start = globalThis.__testNativeElements.find(
        (props) => props.accessibilityLabel === 'Start match',
      );
      start.onPress();
      const match = game.getSnapshot().data.match;
      assert.equal(match.players.length, 1);
      assert.equal(match.config.mode, 'under');
      assert.match(render(GameScreen, match), /Ready, Alex\?/);
      assert.doesNotMatch(render(GameScreen, match), /Pass to/);
    } finally {
      delete globalThis.__testNativeElements;
    }
  });

  it('keeps a solo player going through safe turns and every life, then shows the final bust', () => {
    let match = turn(fresh(), 400);
    assert.equal(match.phase.outcome, 'safe');
    match = act(match, 'CONTINUE');
    match = turn(match, 600);
    assert.equal(match.phase.outcome, 'safe');
    assert.equal(match.totalMs, 1000);
    match = act(match, 'CONTINUE');
    for (const [index, elapsed] of [1, 1001, 1001].entries()) {
      match = turn(match, elapsed);
      assert.equal(match.lives.a, 2 - index);
      assert.equal(match.phase.kind, index === 2 ? 'matchResults' : 'saved');
      assert.equal(validMatch(match), true);
      const restored = reload(match);
      assert.equal(validMatch(restored), true);
      if (index < 2) {
        match = act(act(restored, 'RESUME'), 'CONTINUE');
        assert.equal(match.turn, 0);
        assert.equal(match.totalMs, 0);
        assert.equal(match.round, index + 2);
      } else match = restored;
    }
    assert.deepEqual(match.winners, []);
    const html = render(GameScreen, match);
    assert.match(html, /Game over/);
    assert.match(html, /Final bust/);
    assert.match(html, /cumulative 1\.001 s/);
    assert.doesNotMatch(html, /Alex wins/);
    assert.equal(act(match, 'CONTINUE'), match); // No loop searching for a surviving player.
    assert.equal(validMatch({ ...match, lives: { a: 1 } }), false);
  });

  it('ends after the first bust with one life and preserves a running solo round on interruption', () => {
    const ended = turn(fresh(1), 1001);
    assert.equal(ended.phase.kind, 'matchResults');
    assert.equal(validMatch(ended), true);
    let match = act(turn(fresh(), 400), 'CONTINUE');
    match = act(act(match, 'READY'), 'START');
    match = reload(match);
    assert.equal(match.totalMs, 400);
    assert.equal(match.lives.a, 3);
    match = act(match, 'RESUME');
    match = turn(match, 601);
    assert.equal(match.lives.a, 2);
    assert.deepEqual(
      match.phase.bustContributions.map((entry) => entry.elapsedMs),
      [400, 601],
    );
  });
});
