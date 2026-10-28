import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createMatch,
  currentId,
  DEFAULT_CONFIGS,
  recover,
  RUSH_TARGETS,
  rushScore,
  transition,
} from '../src/model/game.ts';
import { decodeSnapshot, emptySnapshot, validMatch } from '../src/utils/snapshot.ts';
import { GameStore } from '../src/stores/GameStore.ts';
import { game } from '../src/stores/game.ts';
import GameScreen from '../src/screens/GameScreen/GameScreen.tsx';
import HomeScreen from '../src/screens/HomeScreen/HomeScreen.tsx';
import SetupScreen from '../src/screens/SetupScreen/SetupScreen.tsx';
import RosterScreen from '../src/screens/RosterScreen/RosterScreen.tsx';

const players = [
  { id: 'a', name: 'Alex' },
  { id: 'b', name: 'Sam' },
  { id: 'c', name: 'Charlie' },
];
const noRandom = () => {
  throw Error('Time Rush must not draw random targets');
};
const act = (match, type, extra = {}) => transition(match, { type, ...extra }, noRandom);
const fresh = (roster = players) => createMatch('rush', DEFAULT_CONFIGS.rush, roster, noRandom);
const reload = (match) =>
  decodeSnapshot(JSON.stringify({ ...emptySnapshot(), roster: match.players, match })).match;
const attempt = (match, elapsed) => act(act(match, 'START'), 'STOP', { elapsed });

function completePlayer(match, times) {
  match = act(match, 'READY');
  for (const elapsed of times) match = attempt(match, elapsed);
  assert.equal(match.phase.kind, 'saved');
  return match;
}

function completeGame(profiles) {
  let match = fresh();
  for (const times of profiles) match = act(completePlayer(match, times), 'CONTINUE');
  assert.equal(match.phase.kind, 'matchResults');
  return match;
}

function render(Component, match = null, mode = 'rush', roster = match?.players ?? players) {
  game.load();
  game.update({ ...emptySnapshot(), roster, match });
  globalThis.__testParams = { mode };
  try {
    return renderToStaticMarkup(React.createElement(Component)).replace(/<!--.*?-->/g, '');
  } finally {
    delete globalThis.__testParams;
  }
}

describe('Time Rush sequence and scoring', () => {
  it('allows solo play while rejecting empty rosters and preserving other games’ minimums', () => {
    assert.equal(validMatch(fresh(players.slice(0, 1))), true);
    assert.throws(() => fresh([]), /Choose 1–12 players/);
    for (const mode of ['closest', 'increments', 'imposter']) {
      const minimum = mode === 'imposter' ? 3 : 2;
      assert.throws(
        () => createMatch('solo', DEFAULT_CONFIGS[mode], players.slice(0, 1), noRandom),
        new RegExp(`Choose ${minimum}–12 players`),
      );
    }
  });

  it('completes and resumes a solo sequence with its score and all five breakdown rows', () => {
    let match = act(fresh(players.slice(0, 1)), 'READY');
    match = attempt(attempt(match, 1100), 1800);
    match = act(match, 'START');
    const restored = reload(match);
    assert.equal(validMatch(restored), true);
    assert.equal(restored.players.length, 1);
    assert.equal(restored.targetMs, 3000);
    match = act(act(restored, 'RESUME'), 'READY');
    for (const elapsed of [3450, 4000, 4800]) match = attempt(match, elapsed);
    assert.equal(match.scores.a, 950);
    assert.match(render(GameScreen, match), /aria-label="View result"/);
    match = act(match, 'CONTINUE');
    assert.equal(match.phase.kind, 'matchResults');
    assert.equal(validMatch(match), true);
    assert.deepEqual(reload(match), match);
    const html = render(GameScreen, match);
    assert.match(html, /Your result/);
    assert.match(html, /00\.95 s/);
    assert.equal((html.match(/aria-label="Alex\. Target /g) || []).length, 5);
    assert.doesNotMatch(html, /Alex wins|lowest wins|Pass to/);
  });

  it('starts at 1 second and advances through five separate attempts before passing', () => {
    let match = fresh();
    assert.equal(match.targetMs, 1000);
    assert.deepEqual(match.rushAttempts, {});
    assert.equal(validMatch(match), true);
    match = act(match, 'READY');
    const times = [1100, 1800, 3450, 4000, 4800];
    for (const [index, elapsed] of times.entries()) {
      assert.equal(match.targetMs, (index + 1) * 1000);
      assert.equal(currentId(match), 'a');
      match = attempt(match, elapsed);
      assert.deepEqual(match.intervals, []);
      assert.deepEqual(match.rushAttempts.a, times.slice(0, index + 1));
      assert.equal(match.phase.kind, index === 4 ? 'saved' : 'paused');
      assert.equal(match.scores.a, index === 4 ? 950 : 0);
      assert.equal(validMatch(match), true);
      if (index < 4) assert.equal(act(match, 'CONTINUE'), match);
    }
    assert.equal(act(match, 'STOP', { elapsed: 9999 }), match);
    match = act(match, 'CONTINUE');
    assert.equal(currentId(match), 'b');
    assert.equal(match.targetMs, 1000);
    assert.equal(match.phase.kind, 'handoff');
    assert.equal(validMatch(match), true);
  });

  it('sums absolute errors without cancellation and ranks lowest totals, including ties', () => {
    assert.equal(rushScore([1100, 1800, 3450, 4000, 4800]), 950);
    assert.equal(rushScore([900, 2100, 3000, 4000, 5000]), 200);
    assert.equal(rushScore(RUSH_TARGETS), 0);
    const match = completeGame([
      [1100, 1800, 3450, 4000, 4800],
      [900, 2100, 3000, 4000, 5000],
      [1000, 2000, 3200, 4000, 5000],
    ]);
    assert.deepEqual(match.scores, { a: 950, b: 200, c: 200 });
    assert.deepEqual(match.winners, ['b', 'c']);
    assert.equal(match.awarded, true);
    assert.equal(validMatch(match), true);
    assert.deepEqual(reload(match), match);
    for (const type of ['CONTINUE', 'STOP', 'NEXT_ROUND', 'READY', 'START'])
      assert.equal(act(match, type, { elapsed: 1000 }), match);
  });

  it('rounds each independent attempt to the displayed hundredth before adding errors', () => {
    const match = completePlayer(fresh(), [1001.6, 1998.4, 2994.9, 4005.1, 4994.9]);
    assert.deepEqual(match.rushAttempts.a, [1000, 2000, 2990, 4010, 4990]);
    assert.equal(match.scores.a, 30);
    assert.equal(validMatch(match), true);
  });

  it('uses a fresh monotonic start for every target, excluding long gaps', () => {
    let now = 0;
    let raw = null;
    const engine = new GameStore(
      {
        read: () => raw,
        write(value) {
          raw = value;
        },
        clear() {
          raw = null;
        },
      },
      () => now,
      noRandom,
    );
    engine.load();
    engine.update({ ...engine.getSnapshot().data, roster: players });
    engine.startMatch('clock', DEFAULT_CONFIGS.rush);
    engine.dispatch({ type: 'READY' });
    for (const elapsed of [1100, 1800, 3450, 4000, 4800]) {
      now += 100000;
      engine.activate();
      now += elapsed;
      engine.activate();
    }
    const match = engine.getSnapshot().data.match;
    assert.deepEqual(match.rushAttempts[match.order[0]], [1100, 1800, 3450, 4000, 4800]);
    assert.equal(match.scores[match.order[0]], 950);
    assert.equal(match.phase.kind, 'saved');
    assert.equal(validMatch(match), true);
  });
});

describe('Time Rush recovery and saved-state validation', () => {
  it('retains completed targets at every boundary and discards only the active attempt', () => {
    for (let completed = 0; completed < 5; completed++) {
      let match = act(completePlayer(fresh(), RUSH_TARGETS), 'CONTINUE');
      match = act(match, 'READY');
      for (let index = 0; index < completed; index++) match = attempt(match, RUSH_TARGETS[index]);
      for (const interrupted of [match, act(match, 'START')]) {
        const restored = reload(interrupted);
        assert.equal(restored.phase.kind, 'interrupted');
        assert.equal(validMatch(restored), true);
        assert.equal(restored.targetMs, (completed + 1) * 1000);
        assert.deepEqual(restored.rushAttempts.a, RUSH_TARGETS);
        assert.deepEqual(restored.rushAttempts.b || [], RUSH_TARGETS.slice(0, completed));
        let resumed = act(act(restored, 'RESUME'), 'READY');
        for (let index = completed; index < 5; index++)
          resumed = attempt(resumed, RUSH_TARGETS[index]);
        assert.equal(resumed.phase.kind, 'saved');
        assert.deepEqual(resumed.rushAttempts.b, RUSH_TARGETS);
        assert.equal(resumed.scores.b, 0);
        assert.equal(validMatch(resumed), true);
      }
    }
  });

  it('resumes completed turns without repeating targets or adding errors twice', () => {
    let match = completePlayer(fresh(), [1100, 1800, 3450, 4000, 4800]);
    match = act(reload(match), 'RESUME');
    assert.equal(match.phase.kind, 'saved');
    assert.equal(match.scores.a, 950);
    match = act(match, 'CONTINUE');
    assert.equal(currentId(match), 'b');
    assert.equal(match.targetMs, 1000);
    assert.deepEqual(match.rushAttempts.a, [1100, 1800, 3450, 4000, 4800]);
    assert.equal(act(match, 'CONTINUE'), match);
    assert.equal(validMatch(recover(match)), true);
  });

  it('rejects damaged sequences, skipped targets, inconsistent totals, and premature results', () => {
    let match = attempt(act(fresh(), 'READY'), 1100);
    assert.equal(validMatch(match), true);
    const invalid = [
      { rushAttempts: undefined },
      { rushAttempts: null },
      { rushAttempts: [] },
      { rushAttempts: { a: [] } },
      { rushAttempts: { a: [1100, -1] } },
      { rushAttempts: { a: [NaN] } },
      { rushAttempts: { a: [1101] } },
      { rushAttempts: { a: [1000, 2000, 3000, 4000, 5000, 6000] } },
      { rushAttempts: { a: [1100], b: [1000] } },
      { rushAttempts: { unknown: [1000] } },
      { targetMs: 3000 },
      { targetMs: 2220 },
      { scores: { a: 100, b: 0, c: 0 } },
      { phase: { kind: 'saved', outcome: 'saved' } },
      { phase: { kind: 'matchResults' }, awarded: true, winners: ['a'] },
      { phase: { kind: 'roundResults' } },
      { intervals: [1000] },
      { round: 2 },
    ];
    for (const patch of invalid)
      assert.equal(validMatch({ ...match, ...patch }), false, JSON.stringify(patch));
    match = completeGame([RUSH_TARGETS, RUSH_TARGETS, RUSH_TARGETS]);
    for (const patch of [
      { winners: ['a'] },
      { awarded: false },
      { turn: 1 },
      { scores: { a: 1, b: 0, c: 0 } },
      { rushAttempts: { a: RUSH_TARGETS, b: RUSH_TARGETS } },
    ])
      assert.equal(validMatch({ ...match, ...patch }), false);
    assert.throws(
      () => decodeSnapshot(JSON.stringify({ ...emptySnapshot(), version: 5 })),
      /development version/,
    );
  });
});

describe('Time Rush screens', () => {
  it('can save one player in the editor and start solo Time Rush from setup', () => {
    const solo = players.slice(0, 1);
    globalThis.__testNativeElements = [];
    try {
      const editor = render(RosterScreen, null, 'rush', solo);
      assert.match(editor, /1–12 players/);
      const save = globalThis.__testNativeElements.find(
        (props) => props.accessibilityLabel === 'Save players',
      );
      save.onPress();
      assert.deepEqual(game.getSnapshot().data.roster, solo);

      globalThis.__testNativeElements = [];
      const setup = render(SetupScreen, null, 'rush', solo);
      assert.match(setup, /1 player</);
      assert.doesNotMatch(setup, /1 players/);
      const start = globalThis.__testNativeElements.find(
        (props) => props.accessibilityLabel === 'Start match',
      );
      start.onPress();
      const match = game.getSnapshot().data.match;
      assert.equal(match.config.mode, 'rush');
      assert.deepEqual(match.players, solo);
      assert.equal(validMatch(match), true);
      const handoff = render(GameScreen, match);
      assert.match(handoff, /Ready, Alex\?/);
      assert.doesNotMatch(handoff, /Pass to/);
    } finally {
      delete globalThis.__testNativeElements;
    }
  });

  it('is a fifth fixed home choice and has a compact setup without extra settings', () => {
    const home = render(HomeScreen);
    assert.match(home, /aria-label="Play Time Rush"/);
    assert.equal((home.match(/aria-label="Play /g) || []).length, 5);
    assert.doesNotMatch(home, /<main/);
    const setup = render(SetupScreen);
    assert.doesNotMatch(setup, /Minimum|Maximum|Rounds|Lives per player|Max intervals/);
    const resumed = render(HomeScreen, fresh());
    assert.match(resumed, /aria-label="Resume Time Rush"/);
    assert.doesNotMatch(resumed, /aria-label="Play Time Rush"/);
  });

  it('shows the next target and Start next while keeping all results hidden until the end', () => {
    let match = act(fresh(), 'READY');
    for (let index = 0; index < 5; index++) {
      let html = render(GameScreen, match);
      assert.match(html, new RegExp(`Target ${index + 1} / 5`));
      assert.match(html, new RegExp(`>${index + 1}<`));
      assert.doesNotMatch(html, /Total error|Target 01\.00 s\. Time|950/);
      match = act(match, 'START');
      html = render(GameScreen, match);
      assert.match(html, /aria-label="Stop"/);
      assert.doesNotMatch(html, /Total error|01\.23/);
      match = act(match, 'STOP', { elapsed: 1230 });
      html = render(GameScreen, match);
      if (index < 4) {
        assert.match(html, /aria-label="Start next"/);
        assert.doesNotMatch(html, /Attempt saved|aria-label="Continue"/);
      } else {
        assert.match(html, /Attempt saved/);
        assert.match(html, /aria-label="Continue"/);
      }
      assert.doesNotMatch(html, /01\.23|Total error/);
    }
  });

  it('shows five target/time/error/cumulative rows for each player, ordered by total error', () => {
    const match = completeGame([
      [1100, 1800, 3450, 4000, 4800],
      RUSH_TARGETS,
      [900, 2100, 3000, 4000, 5000],
    ]);
    const html = render(GameScreen, match);
    assert.match(html, /Sam wins/);
    assert.match(html, /Total error · seconds · lowest wins/);
    assert.equal((html.match(/aria-label="[^"]+\. Target /g) || []).length, 15);
    assert.match(
      html,
      /Alex\. Target 02\.00 s\. Time 01\.80 s\. Error 00\.20 s\. Total error 00\.30 s\./,
    );
    assert.match(
      html,
      /Alex\. Target 05\.00 s\. Time 04\.80 s\. Error 00\.20 s\. Total error 00\.95 s\./,
    );
    assert.ok(html.indexOf('Sam. Target') < html.indexOf('Charlie. Target'));
    assert.ok(html.indexOf('Charlie. Target') < html.indexOf('Alex. Target'));
    assert.doesNotMatch(html, /point|Final scores|Imposter range/);
  });
});
