import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  assignments,
  centiseconds,
  createMatch,
  currentId,
  DEFAULT_CONFIGS,
  matchWinners,
  privateCard,
  recover,
  resultTime,
  targetPools,
  transition,
  validRanges,
  validateConfig,
  validateRoster,
} from '../src/model/game.ts';
import { GameStore } from '../src/stores/GameStore.ts';
import { decodeSnapshot, emptySnapshot, validMatch } from '../src/utils/snapshot.ts';
import { TimerInput } from '../src/utils/timerInput.ts';
import { guardPointerClick } from '../src/utils/pointerClick.web.ts';
import { game } from '../src/stores/game.ts';
import GameScreen from '../src/screens/GameScreen/GameScreen.tsx';

const players = [
  { id: 'a', name: 'Alex' },
  { id: 'b', name: 'Sam' },
  { id: 'c', name: 'Charlie' },
];
const rnd = () => 0.777777;
const fresh = (mode, config = {}) =>
  createMatch(
    'test',
    {
      ...DEFAULT_CONFIGS[mode],
      ...(mode === 'under' ? { minTargetMs: 10000, maxTargetMs: 10000 } : {}),
      ...config,
    },
    players,
    rnd,
  );
const act = (m, type, extra = {}) => transition(m, { type, ...extra }, rnd);
const ready = (m) => {
  while (m.phase.kind === 'roleHandoff') m = act(act(m, 'READY'), 'HIDE_CARD');
  m = act(m, 'READY');
  return m.phase.kind === 'private' ? act(m, 'HIDE_CARD') : m;
};
const turn = (m, intervals) => {
  m = ready(m);
  for (const elapsed of intervals) m = act(act(m, 'START'), 'STOP', { elapsed });
  return m;
};
function storage() {
  let raw = JSON.stringify({ ...emptySnapshot(), roster: players });
  return {
    read: () => raw,
    write: (value) => {
      raw = value;
    },
    clear: () => {
      raw = null;
    },
  };
}
function store(mode, settings = {}) {
  const adapter = storage();
  let now = 0;
  const engine = new GameStore(adapter, () => now, rnd);
  engine.load();
  engine.startMatch('test', {
    ...DEFAULT_CONFIGS[mode],
    ...(mode === 'under' ? { minTargetMs: 10000, maxTargetMs: 10000 } : {}),
    ...settings,
  });
  return {
    engine,
    adapter,
    time: (value) => {
      now = value;
    },
  };
}

describe('uniform generation and setup', () => {
  it('exhausts Imposter clues for regular and funny targets, including narrow windows and global bounds', () => {
    for (const [min, max] of [
      [0, 10000],
      [0, 60000],
      [22000, 25000],
      [0, 0],
      [500, 500],
      [60000, 60000],
    ]) {
      const config = { ...DEFAULT_CONFIGS.imposter, minTargetMs: min, maxTargetMs: max };
      const pools = targetPools(config);
      for (const [kind, pool] of Object.entries(pools)) {
        pool.forEach((target, i) => {
          const ranges = validRanges(target, config);
          assert.ok(ranges.length, `No clue for ${target} in ${min}–${max}`);
          ranges.forEach(([low, high], j) => {
            const randomValues = [
              ...(pools.funny.length ? [kind === 'funny' ? 0 : 0.5] : []),
              (i + 0.1) / pool.length,
              0.4,
              (j + 0.1) / ranges.length,
            ];
            const value = assignments(config, players, () => randomValues.shift());
            assert.equal(value.targetMs, target);
            assert.deepEqual(value.range, [low, high]);
            assert.equal(high - low, Math.min(4000, max - min));
            assert.ok(low >= min && high <= max && low <= target && high >= target);
            assert.equal(low % 500, 0);
            assert.equal(randomValues.length, 0);
          });
        });
      }
    }
    assert.deepEqual(validRanges(10000, DEFAULT_CONFIGS.imposter), [[6000, 10000]]);
    assert.deepEqual(validRanges(0, { minTargetMs: 0, maxTargetMs: 0 }), [[0, 0]]);
    assert.deepEqual(validRanges(500, { minTargetMs: 500, maxTargetMs: 500 }), [[500, 500]]);
    assert.deepEqual(validRanges(60000, { minTargetMs: 60000, maxTargetMs: 60000 }), [
      [60000, 60000],
    ]);
    assert.deepEqual(validRanges(22220, { minTargetMs: 22000, maxTargetMs: 25000 }), [
      [22000, 25000],
    ]);
    assert.ok(
      validRanges(2000, DEFAULT_CONFIGS.imposter).some(([low, high]) => (low + high) / 2 !== 2000),
    );
  });
  it('selects every player with equal random partitions and exactly one imposter', () => {
    players.forEach((player, i) => {
      const values = [0.5, 0, (i + 0.5) / players.length, 0];
      const result = assignments(DEFAULT_CONFIGS.imposter, players, () => values.shift());
      assert.deepEqual(result.imposterIds, [player.id]);
    });
  });
  it('rejects invalid settings, empty/duplicate/long names, duplicate IDs and out-of-bound rosters', () => {
    assert.ok(validateConfig({ mode: 'under', minTargetMs: 1001, maxTargetMs: 10000, lives: 3 }));
    assert.ok(validateConfig({ mode: 'under', minTargetMs: 1000, maxTargetMs: 61000, lives: 3 }));
    assert.ok(validateConfig({ mode: 'under', minTargetMs: 1000, maxTargetMs: 10000, lives: 0 }));
    assert.ok(validateConfig({ ...DEFAULT_CONFIGS.increments, maxIncrements: 2.5 }));
    assert.ok(validateConfig({ ...DEFAULT_CONFIGS.closest, rounds: 4 }));
    assert.ok(
      validateRoster([
        { id: 'a', name: ' Alex ' },
        { id: 'b', name: 'alex' },
      ]),
    );
    assert.ok(
      validateRoster([
        { id: 'a', name: '' },
        { id: 'b', name: 'X' },
      ]),
    );
    assert.ok(
      validateRoster([
        { id: 'a', name: 'X'.repeat(25) },
        { id: 'b', name: 'Y' },
      ]),
    );
    assert.ok(
      validateRoster([
        { id: 'a', name: 'X' },
        { id: 'a', name: 'Y' },
      ]),
    );
    assert.throws(() => createMatch('x', DEFAULT_CONFIGS.imposter, players.slice(0, 2), rnd));
    assert.equal(
      validateConfig({ mode: 'under', minTargetMs: 60000, maxTargetMs: 60000, lives: 5 }),
      null,
    );
  });
  it('freezes copies of roster and mode configuration', () => {
    const roster = structuredClone(players),
      config = { ...DEFAULT_CONFIGS.closest };
    const m = createMatch('x', config, roster, rnd);
    roster[0].name = 'Changed';
    config.rounds = 10;
    assert.equal(m.players[0].name, 'Alex');
    assert.equal(m.config.rounds, 5);
  });
});

describe('imposter privacy and scoring', () => {
  it('private view exposes a range alone to the imposter; cannot read it after hiding', () => {
    let m = fresh('imposter');
    m.rolesRevealed = m.order.indexOf(m.imposterIds[0]);
    m = act(m, 'READY');
    const card = privateCard(m);
    assert.deepEqual(Object.keys(card), ['role', 'instruction']);
    assert.equal(card.role, 'Imposter');
    assert.ok(!card.instruction.includes('Target 8 seconds'));
    assert.throws(() => privateCard(act(m, 'HIDE_CARD')));
  });
  for (const correct of [true, false])
    it(`awards a ${correct ? 'correct' : 'wrong'} accusation once, including reload`, () => {
      let m = fresh('imposter');
      for (let i = 0; i < players.length; i++) {
        m = turn(m, [8123]);
        assert.equal(m.phase.kind, 'saved');
        assert.equal(m.phase.outcome, 'saved');
        assert.equal(m.awarded, false);
        m = act(m, 'CONTINUE');
      }
      assert.equal(m.phase.kind, 'discussion');
      assert.equal(act(m, 'LOCK'), m);
      const accused = correct
        ? m.imposterIds[0]
        : players.find((p) => !m.imposterIds.includes(p.id)).id;
      m = act(m, 'ACCUSE', { id: accused });
      assert.equal(m.phase.kind, 'accusation');
      assert.equal(m.awarded, false);
      m = act(m, 'LOCK');
      players.forEach((p) =>
        assert.equal(
          m.scores[p.id],
          correct ? Number(!m.imposterIds.includes(p.id)) : Number(m.imposterIds.includes(p.id)),
        ),
      );
      const saved = decodeSnapshot(JSON.stringify({ ...emptySnapshot(), match: m })).match;
      const resumed = act(saved, 'RESUME');
      assert.deepEqual(act(resumed, 'LOCK').scores, m.scores);
      assert.deepEqual(act(m, 'LOCK'), m);
    });
  it('renders no previous private card, elapsed time, or errors before a locked accusation', () => {
    game.load();

    let m = fresh('imposter');
    const render = () => {
      game.update({ ...emptySnapshot(), match: m });
      return renderToStaticMarkup(React.createElement(GameScreen));
    };
    m = act(m, 'READY');
    assert.match(render(), /PRIVATE CARD/);
    m = act(m, 'HIDE_CARD');
    let html = render();
    assert.doesNotMatch(html, /PRIVATE CARD|Crewmate|somewhere from|Target 8 seconds/);
    m = ready(m);
    m = act(act(m, 'START'), 'STOP', { elapsed: 7654 });
    html = render();
    assert.doesNotMatch(html, /7\.65|error|Crewmate|Imposter range/);
    m = act(m, 'CONTINUE');
    html = render();
    assert.doesNotMatch(html, /7\.65|PRIVATE CARD|Crewmate|somewhere from/);
    while (m.phase.kind !== 'discussion') m = act(turn(m, [8123]), 'CONTINUE');
    html = render();
    assert.doesNotMatch(html, /7\.65|8\.12|error|Imposter range/);
    m = act(m, 'ACCUSE', { id: players[0].id });
    assert.doesNotMatch(render(), /7\.65|8\.12|Imposter range/);
    m = act(m, 'LOCK');
    html = render();
    assert.match(html, /7\.65/);
    assert.match(html, /Imposter range/);
  });
});

describe('closest matches and increment precision', () => {
  it('7.90 and 8.10 tie at an 8-second target, with tied final winners', () => {
    let m = fresh('closest', { rounds: 3 });
    for (let round = 0; round < 3; round++) {
      m.targetMs = 8000;
      const fixtures = { a: 7900, b: 8100, c: 8300 };
      for (let i = 0; i < 3; i++) m = act(turn(m, [fixtures[currentId(m)]]), 'CONTINUE');
      assert.equal(m.phase.kind, 'roundResults');
      assert.deepEqual(m.winners, ['a', 'b']);
      const scores = m.scores;
      assert.equal(act(m, 'CONTINUE'), m);
      m = act(m, 'NEXT_ROUND');
      assert.deepEqual(m.scores, scores);
      if (round < 2) assert.equal(m.order[0], players[round + 1].id);
    }
    assert.equal(m.phase.kind, 'matchResults');
    assert.deepEqual(matchWinners(m), ['a', 'b']);
    assert.deepEqual(m.scores, { a: 3, b: 3, c: 0 });
  });
  it('rounds displayed values and comparisons to the same centiseconds', () => {
    assert.equal(centiseconds(7899), 7900);
    assert.equal(centiseconds(8101), 8100);
    assert.equal(resultTime(centiseconds(7899)), '07.90');
  });
  it('2.1 + 3.0 + 2.9 running seconds totals 8.0 despite long pauses', () => {
    const { engine, time } = store('increments');
    engine.dispatch({ type: 'READY' });
    let now = 0;
    for (const duration of [2100, 3000, 2900]) {
      time(now);
      engine.activate();
      now += duration;
      time(now);
      engine.activate();
      now += 10000;
    }
    const m = engine.getSnapshot().data.match;
    assert.equal(m.attempts[currentId(m)], 8000);
    assert.equal(m.phase.kind, 'saved');
    time(now);
    engine.activate();
    engine.dispatch({ type: 'STOP', elapsed: 1000 });
    assert.equal(engine.getSnapshot().data.match, m);
  });
  it('sums fractional intervals before rounding the final total', () => {
    const m = turn(fresh('increments'), [1001.6, 1001.6, 1001.6]);
    assert.equal(m.attempts.a, 3000); // Rounding each interval first would yield 3.01.
  });
});

describe('Stay Under shared total and lives', () => {
  it('9.8 + 0.2 is safe; 9.8 + 0.201 loses one life and resets', () => {
    let m = fresh('under');
    m = act(turn(m, [9800]), 'CONTINUE');
    const prior = m;
    const safe = turn(m, [200]);
    assert.equal(safe.totalMs, 10000);
    assert.deepEqual(safe.phase, { kind: 'saved', outcome: 'safe' });
    const bust = turn(prior, [201]);
    assert.equal(bust.totalMs, 0);
    assert.equal(bust.lives.b, 2);
    assert.deepEqual(bust.phase, {
      kind: 'saved',
      outcome: 'bust',
      bustMs: 10001,
      bustContributions: [
        { playerId: 'a', elapsedMs: 9800, cumulativeMs: 9800 },
        { playerId: 'b', elapsedMs: 201, cumulativeMs: 10001 },
      ],
    });
    assert.deepEqual(act(bust, 'STOP', { elapsed: 10001 }), bust);
    const resumed = act(
      decodeSnapshot(JSON.stringify({ ...emptySnapshot(), match: bust })).match,
      'RESUME',
    );
    assert.equal(resumed.lives.b, 2);
    assert.equal(act(resumed, 'CONTINUE').turn, 2);
  });
  it('skips eliminated players, never grants a bust extra turn, and ends immediately', () => {
    let m = fresh('under', { lives: 1 });
    m = turn(m, [10001]);
    assert.equal(m.lives.a, 0);
    m = act(m, 'CONTINUE');
    assert.equal(currentId(m), 'b');
    m = act(turn(m, [1]), 'CONTINUE');
    assert.equal(currentId(m), 'c');
    m = act(turn(m, [1]), 'CONTINUE');
    assert.equal(currentId(m), 'b');
    m = turn(m, [10001]);
    assert.equal(m.phase.kind, 'matchResults');
    assert.deepEqual(m.winners, ['c']);
    assert.equal(m.lives.c, 1);
  });
  it('renders only Safe with no committed total or historical interval', () => {
    game.load();

    const m = turn(fresh('under'), [9876]);
    game.update({ ...emptySnapshot(), match: m });
    const html = renderToStaticMarkup(React.createElement(GameScreen));
    assert.match(html, /Safe/);
    assert.doesNotMatch(html, /9\.876|9\.88|9876/);
  });
});

describe('canonical rapid input', () => {
  it('swallows the timer gesture click across unmount but permits a new handoff gesture', () => {
    const listeners = new Map();
    const target = {
      addEventListener: (type, fn) => listeners.set(type, fn),
      removeEventListener: (type, fn) => {
        if (listeners.get(type) === fn) listeners.delete(type);
      },
    };
    let stopped = false;
    guardPointerClick(target);
    listeners.get('click')({
      detail: 1,
      preventDefault() {},
      stopImmediatePropagation() {
        stopped = true;
      },
    });
    assert.equal(stopped, true);
    assert.equal(listeners.size, 0);
    guardPointerClick(target);
    listeners.get('pointerdown')({ isPrimary: true });
    assert.equal(listeners.size, 0); // A new deliberate click can reach Continue.
  });
  it('accepts distinct rapid taps, rejects held presses, synthetic clicks and multi-touch', () => {
    let count = 0;
    const gate = new TimerInput(() => count++);
    gate.pointerDown(1);
    gate.pointerDown(1);
    gate.pointerDown(2, false);
    gate.click(1);
    assert.equal(count, 1);
    gate.pointerUp(2);
    gate.pointerDown(2, true);
    assert.equal(count, 1);
    gate.pointerUp(1);
    gate.pointerDown(3);
    gate.pointerUp(3);
    gate.click(1);
    assert.equal(count, 2);
    gate.pointerDown(4);
    gate.cancel();
    gate.pointerDown(5);
    gate.pointerUp(5);
    assert.equal(count, 4);
    gate.click(0);
    assert.equal(count, 5); // Assistive activation.
  });
  it('ignores keyboard repeats, other keys, and click synthesis while a key is held', () => {
    let count = 0;
    const gate = new TimerInput(() => count++);
    gate.keyDown(' ', false);
    gate.keyDown(' ', true);
    gate.keyDown(' ', false);
    gate.click(0);
    gate.keyDown('Enter', true);
    gate.keyDown('x', false);
    assert.equal(count, 1);
    gate.keyUp(' ');
    gate.keyDown('Enter', false);
    gate.keyUp('Enter');
    assert.equal(count, 2);
  });
  it('synchronous timer accepts a 1 ms start/stop pair without stale-render races', () => {
    const { engine, time } = store('under');
    engine.dispatch({ type: 'READY' });
    time(0);
    engine.activate();
    time(1);
    engine.activate();
    assert.equal(engine.getSnapshot().data.match.totalMs, 1);
    engine.activate();
    assert.equal(engine.getSnapshot().data.match.phase.kind, 'saved');
  });
});

describe('storage and interrupted recovery', () => {
  it('locks new matches during a safe update and unlocks a rejected update', () => {
    const engine = new GameStore(storage(), () => 0, rnd);
    engine.load();
    assert.equal(engine.beginUpdate(), true);
    assert.equal(engine.startMatch('blocked', DEFAULT_CONFIGS.closest), false);
    assert.equal(engine.getSnapshot().data.match, null);
    engine.cancelUpdate();
    assert.equal(engine.startMatch('allowed', DEFAULT_CONFIGS.closest), true);
    assert.equal(engine.beginUpdate(), false);
    assert.equal(engine.getSnapshot().updatePending, false);
  });
  it('a failed ordinary write accepts edits in memory and leaves the old save untouched', () => {
    const adapter = storage();
    let fail = false;
    const engine = new GameStore(
      {
        ...adapter,
        write: (value) => {
          if (fail) throw Error('quota');
          adapter.write(value);
        },
      },
      () => 0,
      rnd,
    );
    engine.load();
    engine.startMatch('saved', DEFAULT_CONFIGS.closest);
    const before = engine.getSnapshot().data;
    fail = true;
    const edited = { ...before, match: null, roster: players };
    assert.equal(engine.update(edited), true);
    assert.equal(engine.getSnapshot().data, edited);
    assert.equal(engine.getSnapshot().memoryOnly, true);
    assert.equal(JSON.parse(adapter.read()).match.id, 'saved');
    assert.equal(engine.startMatch('session', DEFAULT_CONFIGS.closest), true);
    assert.deepEqual(engine.getSnapshot().data.match.players, players);
  });
  it('persists the running marker before an accepted interval and recovers killed sessions', () => {
    const { engine, time, adapter } = store('closest');
    engine.dispatch({ type: 'READY' });
    time(40);
    engine.activate();
    assert.equal(JSON.parse(adapter.read()).match.phase.kind, 'running');
    const reload = new GameStore(adapter, () => 1e9, rnd);
    reload.load();
    const m = reload.getSnapshot().data.match;
    assert.equal(m.phase.kind, 'interrupted');
    assert.equal(m.phase.replay, true);
    assert.deepEqual(m.attempts, {});
    assert.deepEqual(m.intervals, []);
    reload.activate();
    assert.equal(reload.getSnapshot().data.match, m);
  });
  it('discards all unfinished increments while preserving other completed players and assignments', () => {
    let m = act(turn(fresh('increments'), [1000, 1000, 1000]), 'CONTINUE');
    m = ready(m);
    m = act(act(m, 'START'), 'STOP', { elapsed: 2100 });
    m = act(m, 'START');
    const restored = recover(m);
    assert.deepEqual(restored.attempts, { a: 3000 });
    assert.deepEqual(restored.intervals, []);
    assert.equal(currentId(restored), 'b');
    assert.equal(restored.targetMs, m.targetMs);
    let imposter = act(fresh('imposter'), 'READY');
    const assignment = imposter.imposterIds;
    imposter = recover(imposter);
    imposter = act(act(imposter, 'RESUME'), 'READY');
    assert.equal(imposter.phase.kind, 'private');
    assert.deepEqual(imposter.imposterIds, assignment);
  });
  it('discards only unfinished Stay Under time, preserving the shared total and lives', () => {
    const m = act(ready(act(turn(fresh('under'), [9800]), 'CONTINUE')), 'START');
    const replay = recover(m);
    assert.equal(replay.totalMs, 9800);
    assert.deepEqual(replay.lives, m.lives);
    assert.equal(currentId(replay), 'b');
  });
  for (const failureAt of ['Start', 'Stop']) {
    it(`a failed ${failureAt} write switches to memory without dropping or delaying the timer action`, () => {
      const adapter = storage();
      let fail = false,
        now = 0,
        writes = 0;
      const engine = new GameStore(
        {
          ...adapter,
          write(value) {
            writes++;
            if (fail) throw Error('quota');
            adapter.write(value);
          },
        },
        () => now,
        rnd,
      );
      engine.load();
      engine.startMatch('x', DEFAULT_CONFIGS.closest);
      engine.dispatch({ type: 'READY' });
      fail = failureAt === 'Start';
      engine.activate();
      assert.equal(engine.getSnapshot().data.match.phase.kind, 'running');
      fail = true;
      now = 8000;
      engine.activate();
      const m = engine.getSnapshot().data.match;
      assert.equal(m.phase.kind, 'saved');
      assert.equal(m.attempts[currentId(m)], 8000);
      assert.equal(engine.getSnapshot().memoryOnly, true);
      assert.equal(
        JSON.parse(adapter.read()).match.phase.kind,
        failureAt === 'Start' ? 'ready' : 'running',
      );
      const attempts = writes;
      engine.dispatch({ type: 'CONTINUE' });
      engine.dispatch({ type: 'READY' });
      now = 9000;
      engine.activate();
      now = 9001;
      engine.activate();
      assert.equal(writes, attempts); // No repeated attempts to use unavailable saving.
      const next = engine.getSnapshot().data.match;
      assert.equal(next.attempts[currentId(next)], 0); // Closest mode rounds 1 ms to centiseconds.
      assert.equal(next.phase.kind, 'saved');
    });
  }
  it('unreadable saves allow new games in memory without overwriting the original data', () => {
    for (const raw of [
      '{',
      '{}',
      '{"version":99}',
      JSON.stringify({ ...emptySnapshot(), match: { phase: { kind: 'running' } } }),
    ]) {
      const adapter = storage();
      adapter.write(raw);
      const engine = new GameStore(adapter, () => 0, rnd);
      engine.load();
      assert.equal(engine.getSnapshot().loaded, true);
      assert.equal(engine.getSnapshot().memoryOnly, true);
      engine.update({ ...engine.getSnapshot().data, roster: players });
      assert.equal(engine.startMatch('session', DEFAULT_CONFIGS.closest), true);
      assert.equal(engine.getSnapshot().data.match.phase.kind, 'handoff');
      assert.equal(adapter.read(), raw);
      engine.clear();
      assert.equal(adapter.read(), null);
    }
  });
  it('unavailable reads automatically allow editing and play without any storage opt-in', () => {
    let reads = 0,
      writes = 0;
    const engine = new GameStore(
      {
        read() {
          reads++;
          throw Error('disabled');
        },
        write() {
          writes++;
          throw Error('disabled');
        },
        clear() {
          throw Error('disabled');
        },
      },
      () => 0,
      rnd,
    );
    engine.load();
    assert.equal(engine.getSnapshot().memoryOnly, true);
    assert.equal(engine.update({ ...emptySnapshot(), roster: players }), true);
    assert.equal(engine.startMatch('memory', DEFAULT_CONFIGS.closest), true);
    engine.dispatch({ type: 'READY' });
    engine.activate(10);
    engine.activate(8010);
    const m = engine.getSnapshot().data.match;
    assert.equal(m.phase.kind, 'saved');
    assert.equal(m.attempts.a, 8000);
    assert.equal(reads, 1);
    assert.equal(writes, 0);
    assert.doesNotThrow(() => engine.clear());
    assert.equal(engine.getSnapshot().data.match, null);
    assert.deepEqual(engine.getSnapshot().data.roster, []);
    assert.throws(
      () => engine.startMatch('after-clear', DEFAULT_CONFIGS.closest),
      /Choose 2–12 players/,
    );
  });
  it('read failure during a storage event recovers the in-memory attempt and ignores further external saves', () => {
    const adapter = storage();
    let unreadable = false,
      changed;
    const engine = new GameStore(
      {
        ...adapter,
        read() {
          if (unreadable) throw Error('disabled');
          return adapter.read();
        },
        subscribe(listener) {
          changed = listener;
          return () => {};
        },
      },
      () => 0,
      rnd,
    );
    engine.load();
    engine.watchExternal();
    engine.startMatch('local', DEFAULT_CONFIGS.closest);
    engine.dispatch({ type: 'READY' });
    engine.activate(10);
    unreadable = true;
    changed();
    assert.equal(engine.getSnapshot().memoryOnly, true);
    assert.equal(engine.getSnapshot().data.match.phase.kind, 'interrupted');
    engine.dispatch({ type: 'RESUME' });
    engine.dispatch({ type: 'READY' });
    engine.activate(20);
    engine.activate(8020);
    const local = engine.getSnapshot().data;
    unreadable = false;
    adapter.clear();
    changed();
    assert.equal(engine.getSnapshot().data, local);
    assert.equal(local.match.phase.kind, 'saved');
  });
  it('unavailable storage subscriptions do not block app startup', () => {
    const engine = new GameStore(
      {
        ...storage(),
        subscribe() {
          throw Error('disabled');
        },
      },
      () => 0,
      rnd,
    );
    engine.load();
    assert.doesNotThrow(() => engine.watchExternal()());
    assert.equal(engine.getSnapshot().memoryOnly, true);
    assert.equal(engine.startMatch('memory', DEFAULT_CONFIGS.closest), true);
  });
  it('a stale tab refreshes the latest saved match instead of overwriting it', () => {
    const adapter = storage();
    const first = new GameStore(adapter, () => 0, rnd),
      second = new GameStore(adapter, () => 0, rnd);
    first.load();
    second.load();
    first.startMatch('first', DEFAULT_CONFIGS.imposter);
    const saved = adapter.read();
    second.startMatch('stale', DEFAULT_CONFIGS.closest);
    assert.equal(adapter.read(), saved);
    assert.equal(second.getSnapshot().data.match.id, 'first');
    assert.equal(second.getSnapshot().data.match.phase.kind, 'interrupted');
  });
  it('rejects old development saves and invalid match shapes', () => {
    assert.throws(
      () => decodeSnapshot(JSON.stringify({ version: 0, roster: players })),
      /development version/,
    );
    assert.throws(
      () => decodeSnapshot(JSON.stringify({ ...emptySnapshot(), version: 1 })),
      /development version/,
    );
    const m = fresh('imposter');
    assert.equal(validMatch(m), true);
    assert.equal(validMatch({ ...m, targetMs: 90001 }), false);
    assert.equal(validMatch({ ...m, range: [1000, 9000] }), false);
    assert.equal(validMatch({ ...m, phase: { kind: 'reveal' }, awarded: false }), false);
  });
});
