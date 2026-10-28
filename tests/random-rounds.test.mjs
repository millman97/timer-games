import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  assignments,
  createMatch,
  currentId,
  DEFAULT_CONFIGS,
  privateCard,
  seconds,
  transition,
  targetPools,
  validateConfig,
} from '../src/model/game.ts';
import { decodeSnapshot, emptySnapshot, validMatch } from '../src/utils/snapshot.ts';
import { game } from '../src/stores/game.ts';
import SetupScreen from '../src/screens/SetupScreen/SetupScreen.tsx';
import GameScreen from '../src/screens/GameScreen/GameScreen.tsx';

const players = [
  { id: 'a', name: 'Alex' },
  { id: 'b', name: 'Sam' },
  { id: 'c', name: 'Charlie' },
];
const under = (minTargetMs = 500, maxTargetMs = 10000) => ({
  mode: 'under',
  minTargetMs,
  maxTargetMs,
  lives: 3,
});
const noRandom = () => {
  throw Error('Must preserve the current round');
};
function sequence(...values) {
  return () => {
    assert.ok(values.length, 'Unexpected extra random draw');
    return values.shift();
  };
}
function assignmentRandom(config, ...values) {
  return sequence(
    ...values,
    ...(config.mode === 'imposter' ? [0.5, 0.5] : config.mode === 'increments' ? [0] : []),
  );
}
const act = (m, type, extra = {}, random = noRandom) => transition(m, { type, ...extra }, random);
const turn = (m, elapsed) => act(act(act(m, 'READY'), 'START'), 'STOP', { elapsed });
function finishIncrementRound(m) {
  for (let player = 0; player < players.length; player++) {
    m = act(m, 'READY');
    const count = m.increments;
    for (let interval = 0; interval < count; interval++) {
      m = act(act(m, 'START'), 'STOP', { elapsed: 1000 });
      assert.equal(m.phase.kind, interval + 1 < count ? 'paused' : 'saved');
    }
    m = act(m, 'CONTINUE');
  }
  assert.equal(m.phase.kind, 'roundResults');
  return m;
}
function render(Component, match = null, mode) {
  game.load();
  game.update({ ...emptySnapshot(), roster: players, match });
  globalThis.__testParams = mode ? { mode } : {};
  try {
    return renderToStaticMarkup(React.createElement(Component)).replace(/<!--.*?-->/g, '');
  } finally {
    delete globalThis.__testParams;
  }
}

describe('shared target generation', () => {
  it('makes every regular and funny target selectable and saveable in every random-target mode', () => {
    for (const defaults of Object.values(DEFAULT_CONFIGS).filter(
      (config) => config.mode !== 'rush',
    )) {
      const config = { ...defaults, minTargetMs: 500, maxTargetMs: 25000 };
      const pools = targetPools(config);
      for (const [kind, pool] of Object.entries(pools)) {
        pool.forEach((expected, index) => {
          const m = createMatch(
            'shared',
            config,
            players,
            assignmentRandom(config, kind === 'funny' ? 0 : 0.5, (index + 0.5) / pool.length),
          );
          assert.equal(m.targetMs, expected, `${config.mode}: ${kind} target`);
          assert.equal(validMatch(m), true, `${config.mode}: saved target ${expected}`);
        });
      }
      assert.ok(pools.regular.includes(22220));
      assert.ok(pools.regular.includes(1500));
      assert.ok(pools.funny.includes(24670));
      assert.ok(pools.funny.includes(24690));
      assert.ok(pools.funny.includes(4200));
      let funnyCount = 0;
      for (let bucket = 0; bucket < 20; bucket++) {
        const target = assignments(
          config,
          players,
          assignmentRandom(config, (bucket + 0.5) / 20, 0),
        ).targetMs;
        if (pools.funny.includes(target)) funnyCount++;
      }
      assert.equal(funnyCount, 1, `${config.mode}: combined 5% funny chance`);
    }
  });
  it('validates identical range bounds and rejects unsupported saved targets in every random-target mode', () => {
    for (const defaults of Object.values(DEFAULT_CONFIGS).filter(
      (config) => config.mode !== 'rush',
    )) {
      for (const [min, max] of [
        [-500, 1000],
        [670, 1000],
        [1500, 1000],
        [500, 60500],
        [NaN, 1000],
        [500, Infinity],
      ])
        assert.ok(validateConfig({ ...defaults, minTargetMs: min, maxTargetMs: max }));
      assert.ok(validateConfig({ ...defaults, minTargetMs: undefined }));
      for (const target of [0, 500, 60000]) {
        const config = { ...defaults, minTargetMs: target, maxTargetMs: target };
        const m = createMatch('fixed', config, players, assignmentRandom(config, 0.5));
        assert.equal(m.targetMs, target);
        assert.equal(validMatch(m), true);
      }
      const config = { ...defaults, minTargetMs: 500, maxTargetMs: 25000 };
      const m = createMatch('valid', config, players, assignmentRandom(config, 0.5, 0));
      for (const targetMs of [499, 25500, 1234, 1111, NaN, Infinity])
        assert.equal(validMatch({ ...m, targetMs }), false);
    }
  });
  it('retains fractional targets and Imposter clues through interruption and reload', () => {
    for (const defaults of Object.values(DEFAULT_CONFIGS).filter(
      (config) => config.mode !== 'rush',
    )) {
      const config = { ...defaults, minTargetMs: 500, maxTargetMs: 25000 };
      const { regular, funny } = targetPools(config);
      for (const [pool, gate, target] of [
        [regular, 0.5, 22220],
        [funny, 0, 24690],
        [funny, 0, 4200],
      ]) {
        const original = createMatch(
          'resume',
          config,
          players,
          assignmentRandom(config, gate, (pool.indexOf(target) + 0.5) / pool.length),
        );
        const active = act(original, 'READY');
        const restored = decodeSnapshot(
          JSON.stringify({ ...emptySnapshot(), match: active }),
        ).match;
        const resumed = act(restored, 'RESUME');
        assert.equal(resumed.targetMs, target);
        assert.deepEqual(resumed.config, config);
        assert.deepEqual(resumed.range, original.range);
        assert.equal(resumed.increments, original.increments);
        assert.equal(validMatch(resumed), true);
        if (config.mode === 'imposter') {
          const privateView = {
            ...original,
            rolesRevealed: original.order.indexOf(original.imposterIds[0]),
            phase: { kind: 'private', purpose: 'deal' },
          };
          assert.equal(privateCard(privateView).role, 'Imposter');
          assert.ok(!privateCard(privateView).instruction.includes(`${seconds(target)} seconds`));
          const crewmateView = {
            ...privateView,
            rolesRevealed: (privateView.rolesRevealed + 1) % players.length,
          };
          assert.equal(privateCard(crewmateView).instruction, `Target ${seconds(target)} seconds.`);
          for (const range of [
            [0, 4000],
            [22000, 26000],
            [original.range[0] + 1, original.range[1] + 1],
            [500, 25000],
          ])
            assert.equal(validMatch({ ...original, range }), false);
        }
      }
    }
  });
  it('shares targets across closest players, then draws a new target at the next round', () => {
    for (const mode of ['closest', 'increments']) {
      const config = { ...DEFAULT_CONFIGS[mode], minTargetMs: 500, maxTargetMs: 25000 };
      const { regular, funny } = targetPools(config);
      let m = createMatch(
        'rounds',
        config,
        players,
        assignmentRandom(config, 0.5, (regular.indexOf(22220) + 0.5) / regular.length),
      );
      for (let player = 0; player < players.length; player++) {
        assert.equal(m.targetMs, 22220);
        m = act(m, 'READY');
        const count = m.increments || 1;
        for (let interval = 0; interval < count; interval++)
          m = act(act(m, 'START'), 'STOP', { elapsed: 22220 / count });
        m = act(m, 'CONTINUE');
      }
      assert.equal(m.phase.kind, 'roundResults');
      assert.deepEqual(
        m.winners,
        players.map((p) => p.id),
      );
      const restored = decodeSnapshot(JSON.stringify({ ...emptySnapshot(), match: m })).match;
      m = act(
        act(restored, 'RESUME'),
        'NEXT_ROUND',
        {},
        assignmentRandom(config, 0, (funny.indexOf(24690) + 0.5) / funny.length),
      );
      assert.equal(m.targetMs, 24690);
      assert.equal(m.round, 2);
      assert.equal(validMatch(m), true);
    }
  });
  it('starts every random-target game at 0–10 seconds with the shared range controls', () => {
    for (const mode of Object.keys(DEFAULT_CONFIGS).filter((mode) => mode !== 'rush')) {
      const config = emptySnapshot().settings[mode];
      assert.equal(config.minTargetMs, 0);
      assert.equal(config.maxTargetMs, 10000);
      assert.equal(
        createMatch('zero', config, players, assignmentRandom(config, 0.5, 0)).targetMs,
        0,
      );
      const html = render(SetupScreen, null, mode);
      assert.match(html, /aria-label="Minimum · seconds: 0"/);
      assert.match(html, /aria-label="Maximum · seconds: 10"/);
      assert.doesNotMatch(html, /Half-second targets/);
    }
  });
  it('offers only whole/half seconds and repeated digits inside inclusive bounds', () => {
    for (const [min, max] of [
      [0, 60000],
      [0, 0],
      [0, 500],
      [500, 60000],
      [500, 1000],
      [1000, 3500],
      [4000, 4500],
      [5000, 15000],
      [33000, 34000],
      [60000, 60000],
    ]) {
      const config = under(min, max);
      const { regular, funny } = targetPools(config);
      assert.equal(new Set(regular).size, regular.length);
      assert.ok(regular.includes(min));
      assert.ok(regular.includes(max));
      assert.ok(regular.every((value) => value >= min && value <= max));
      assert.ok(
        regular.every(
          (value) =>
            value % 500 === 0 ||
            /^([1-9])\1+$/.test(seconds(value).replace(/^0\./, '').replace('.', '')),
        ),
      );
      assert.ok(funny.every((value) => value >= min && value <= max));
      assert.ok(
        funny.every((value) => value === 4200 || value % 1000 === 670 || value % 1000 === 690),
      );
      assert.ok(funny.every((value) => !regular.includes(value)));
      // Exhaust all equally sized normal-choice partitions, including both bounds.
      regular.forEach((expected, i) => {
        const select = (i + 0.5) / regular.length;
        const random = funny.length ? sequence(0.5, select) : sequence(select);
        assert.equal(assignments(config, players, random).targetMs, expected);
      });
    }
    const pool = targetPools(under(0, 60000)).regular;
    for (const value of [
      0, 110, 220, 330, 440, 500, 550, 660, 1100, 1110, 2200, 3330, 9990, 11100, 11110, 22200,
      22220, 33330, 55550,
    ])
      assert.ok(pool.includes(value));
    for (const value of [1230, 4200, 12340, 56780]) assert.ok(!pool.includes(value));
  });
  it('gives all funny values together exactly one of twenty random partitions, filtered to the range', () => {
    for (const config of [under(500, 10000), under(500, 1000), under(4000, 4500)]) {
      const funny = targetPools(config).funny;
      let count = 0;
      for (let bucket = 0; bucket < 20; bucket++) {
        const target = assignments(config, players, sequence((bucket + 0.5) / 20, 0)).targetMs;
        if (funny.includes(target)) count++;
      }
      assert.equal(count, 1);
      funny.forEach((expected, i) =>
        assert.equal(
          assignments(config, players, sequence(0, (i + 0.5) / funny.length)).targetMs,
          expected,
        ),
      );
      assert.ok(funny.includes(assignments(config, players, sequence(0.049999, 0)).targetMs));
      assert.ok(!funny.includes(assignments(config, players, sequence(0.05, 0)).targetMs));
    }
    assert.equal(assignments(under(10000, 10000), players, sequence(0)).targetMs, 10000);
    assert.equal(assignments(under(5000, 5000), players, sequence(0.9999)).targetMs, 5000);
  });
  it('can draw every in-range repeated-digit form, including 22.22 below a 25-second maximum', () => {
    const config = under(500, 25000);
    const { regular } = targetPools(config);
    for (const expected of [660, 1100, 1110, 2200, 2220, 11100, 11110, 22200, 22220]) {
      const index = regular.indexOf(expected);
      assert.ok(index >= 0, `${expected} must be an eligible regular target`);
      assert.equal(
        assignments(config, players, sequence(0.5, (index + 0.5) / regular.length)).targetMs,
        expected,
      );
    }
    assert.ok(!regular.includes(33330));
  });
  it('includes x.67 and x.69 for every eligible whole-second part while keeping one combined rare pool', () => {
    const config = under(500, 25000);
    const { funny } = targetPools(config);
    assert.equal(funny.length, 51); // 0–24 with each ending, plus 4.20.
    for (let whole = 0; whole < 25; whole++) {
      assert.ok(funny.includes(whole * 1000 + 670));
      assert.ok(funny.includes(whole * 1000 + 690));
    }
    assert.ok(funny.includes(4200));
    assert.ok(!funny.includes(25670));
    assert.ok(!funny.includes(25690));
    funny.forEach((expected, index) =>
      assert.equal(
        assignments(config, players, sequence(0, (index + 0.5) / funny.length)).targetMs,
        expected,
      ),
    );
    assert.deepEqual(targetPools(under(5500, 6500)).funny, [5670, 5690]);
  });
  it('validates ordered half-second range bounds, lives, and the maximum interval count', () => {
    for (const config of [
      under(-500, 1000),
      under(500, 60500),
      under(1500, 1000),
      under(670, 1000),
      under(NaN, 1000),
      { ...under(), lives: 0 },
    ])
      assert.ok(validateConfig(config));
    assert.equal(validateConfig(under(500, 500)), null);
    assert.equal(validateConfig(under(60000, 60000)), null);
    for (const maximum of [1, 11, 2.5, NaN])
      assert.ok(validateConfig({ ...DEFAULT_CONFIGS.increments, maxIncrements: maximum }));
  });
  it('formats special targets without losing the 4.20 spelling', () => {
    assert.equal(seconds(4200), '4.20');
    assert.equal(seconds(670), '0.67');
    assert.equal(seconds(690), '0.69');
    assert.equal(seconds(1110), '1.11');
    assert.equal(seconds(3330), '3.33');
  });
});

describe('Stay Under round boundaries and recovery', () => {
  it('handles a zero-second target without treating it as missing or imposing a minimum interval', () => {
    let m = createMatch('zero', under(0, 0), players, sequence(0));
    assert.match(render(GameScreen, m), /Target · seconds/);
    m = turn(m, 0);
    assert.equal(m.phase.outcome, 'safe');
    assert.equal(validMatch(m), true);
    m = turn(act(m, 'CONTINUE'), 1);
    assert.equal(m.phase.outcome, 'bust');
    assert.equal(m.phase.bustMs, 1);
    assert.equal(m.lives.b, 2);
    assert.equal(validMatch(m), true);
    const restored = decodeSnapshot(JSON.stringify({ ...emptySnapshot(), match: m })).match;
    assert.equal(restored.targetMs, 0);
    assert.equal(restored.phase.resume.outcome, 'bust');
  });
  it('keeps one target for all safe additions, preserves it for the bust result, and draws on Continue', () => {
    let m = createMatch('range', under(500, 5000), players, sequence(0.5, 0));
    assert.equal(m.targetMs, 500);
    m = act(turn(m, 200), 'CONTINUE');
    assert.equal(m.targetMs, 500);
    assert.equal(m.round, 1);
    m = turn(m, 301);
    assert.equal(m.phase.outcome, 'bust');
    assert.equal(m.targetMs, 500);
    assert.equal(m.round, 1);
    assert.equal(validMatch(m), true);
    assert.equal(m.phase.bustMs, 501);
    assert.equal(m.lives.b, 2);
    const recovered = decodeSnapshot(JSON.stringify({ ...emptySnapshot(), match: m })).match;
    m = act(recovered, 'RESUME');
    assert.equal(m.targetMs, 500);
    m = act(m, 'CONTINUE', {}, sequence(0.5, 0.99999));
    assert.equal(m.targetMs, 5000);
    assert.equal(m.round, 2);
    assert.equal(act(m, 'CONTINUE'), m);
    assert.equal(currentId(m), 'c');
    assert.equal(m.totalMs, 0);
    assert.deepEqual(m.contributions, []);
    assert.equal(validMatch(m), true);
    const saved = decodeSnapshot(JSON.stringify({ ...emptySnapshot(), match: m })).match;
    assert.equal(saved.targetMs, 5000);
    assert.equal(saved.round, 2);
  });
  it('preserves rare targets across an interrupted interval without re-rolling them', () => {
    let m = createMatch('funny', under(), players, sequence(0, 0));
    assert.equal(m.targetMs, 670);
    m = act(turn(m, 200), 'CONTINUE');
    m = act(act(m, 'READY'), 'START');
    const saved = decodeSnapshot(JSON.stringify({ ...emptySnapshot(), match: m })).match;
    assert.equal(saved.targetMs, 670);
    assert.equal(saved.totalMs, 200);
    m = act(saved, 'RESUME');
    m = turn(m, 470);
    assert.equal(m.phase.outcome, 'safe'); // Equality is still safe for fractional targets.
    assert.equal(m.totalMs, 670);
    assert.doesNotMatch(render(GameScreen, m), /0\.670|cumulative|Added · s/);
  });
  it('does not draw another target after the final elimination', () => {
    let m = createMatch(
      'final',
      { ...under(500, 500), lives: 1 },
      players.slice(0, 2),
      sequence(0),
    );
    m = turn(m, 501);
    assert.equal(m.phase.kind, 'matchResults');
    assert.equal(m.targetMs, 500);
    assert.equal(validMatch(m), true);
    assert.equal(act(m, 'CONTINUE'), m);
  });
  it('rejects out-of-range or unsupported targets and inconsistent round numbers in saved games', () => {
    const m = createMatch('valid', under(1000, 5000), players, sequence(0.5, 0));
    for (const targetMs of [670, 690, 5500, 1234])
      assert.equal(validMatch({ ...m, targetMs }), false);
    assert.equal(validMatch({ ...m, targetMs: 1110 }), true);
    assert.equal(validMatch({ ...m, targetMs: 4200 }), true);
    assert.equal(validMatch({ ...m, round: 2 }), false);
    for (const version of [2, 3])
      assert.throws(
        () => decodeSnapshot(JSON.stringify({ ...emptySnapshot(), version })),
        /development version/,
      );
  });
});

describe('random X Increments counts', () => {
  it('draws every integer from 2 through each selected maximum with equal partitions', () => {
    for (let maximum = 2; maximum <= 10; maximum++) {
      const config = { ...DEFAULT_CONFIGS.increments, maxIncrements: maximum };
      for (let count = 2; count <= maximum; count++) {
        const m = createMatch(
          'count',
          config,
          players,
          sequence(0.5, 0, (count - 2 + 0.5) / (maximum - 1)),
        );
        assert.equal(m.increments, count);
        assert.equal(m.config.maxIncrements, maximum);
        assert.equal(validMatch(m), true);
      }
    }
  });
  it('shares the chosen count across players, then draws a new count at the next round', () => {
    const config = { ...DEFAULT_CONFIGS.increments, maxIncrements: 4 };
    let m = createMatch('rounds', config, players, sequence(0.5, 0, 0));
    assert.equal(m.increments, 2);
    m = finishIncrementRound(m);
    assert.deepEqual(m.attempts, { a: 2000, b: 2000, c: 2000 });
    m = act(m, 'NEXT_ROUND', {}, sequence(0.5, 0.99, 0.99));
    assert.equal(m.round, 2);
    assert.equal(m.increments, 4);
    assert.equal(validMatch(m), true);
    m = finishIncrementRound(m);
    assert.deepEqual(m.attempts, { a: 4000, b: 4000, c: 4000 });
  });
  it('keeps its generated count and target when replaying an interrupted attempt', () => {
    let m = createMatch(
      'resume',
      { ...DEFAULT_CONFIGS.increments, maxIncrements: 10 },
      players,
      sequence(0.5, 0.5, 0.5),
    );
    const count = m.increments,
      target = m.targetMs;
    m = act(act(m, 'READY'), 'START');
    m = act(m, 'STOP', { elapsed: 1200 });
    assert.equal(m.phase.kind, 'paused');
    m = decodeSnapshot(JSON.stringify({ ...emptySnapshot(), match: m })).match;
    assert.equal(m.increments, count);
    assert.equal(m.targetMs, target);
    assert.deepEqual(m.intervals, []);
    m = act(act(m, 'RESUME'), 'READY');
    assert.equal(m.increments, count);
    for (const increments of [undefined, 1, 11, 2.5])
      assert.equal(validMatch({ ...m, increments }), false);
    assert.equal(validMatch({ ...m, intervals: Array(count).fill(10) }), false);
  });
  it('shows range settings in setup and the drawn count during handoff and timing', () => {
    const setup = render(SetupScreen, null, 'under');
    assert.match(setup, /Minimum · seconds: 0/);
    assert.match(setup, /Maximum · seconds: 10/);
    const incrementsSetup = render(SetupScreen, null, 'increments');
    assert.match(incrementsSetup, /Max intervals: 3/);
    assert.doesNotMatch(incrementsSetup, /Intervals per player/);
    let m = createMatch(
      'ui',
      { ...DEFAULT_CONFIGS.increments, maxIncrements: 8 },
      players,
      sequence(0.5, 0, 0.999),
    );
    assert.match(render(GameScreen, m), /8 intervals/);
    m = act(m, 'READY');
    assert.match(render(GameScreen, m), /Interval 1 \/ 8/);
  });
});
