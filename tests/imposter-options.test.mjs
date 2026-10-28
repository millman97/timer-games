import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMatch, DEFAULT_CONFIGS, privateCard, transition } from '../src/model/game.ts';
import { decodeSnapshot, emptySnapshot, validMatch } from '../src/utils/snapshot.ts';
import { game } from '../src/stores/game.ts';
import GameScreen from '../src/screens/GameScreen/GameScreen.tsx';
import SetupScreen from '../src/screens/SetupScreen/SetupScreen.tsx';

const players = ['Alex', 'Sam', 'Charlie', 'Drew'].map((name, index) => ({ id: `${index}`, name }));
const act = (match, type, extra = {}) =>
  transition(match, { type, ...extra }, () => {
    throw Error('An existing Imposter game must not draw new assignments');
  });

function fresh(count, maxImposters = players.length, picks = Array(count).fill(0)) {
  const values = [0.5, 0.5, (count + 0.5) / (maxImposters + 1), ...picks, 0.5];
  return createMatch(
    'random',
    { ...DEFAULT_CONFIGS.imposter, randomImposters: true, maxImposters },
    players,
    () => {
      assert.ok(values.length, 'No unexpected random draws');
      return values.shift();
    },
  );
}

function discussion(match) {
  while (match.phase.kind === 'roleHandoff') match = act(act(match, 'READY'), 'HIDE_CARD');
  for (const player of players) {
    match = act(act(act(match, 'READY'), 'START'), 'STOP', { elapsed: 8123 });
    match = act(match, 'CONTINUE');
  }
  assert.equal(match.phase.kind, 'discussion');
  return match;
}

function vote(match, id) {
  return act(act(match, 'ACCUSE', { id }), 'LOCK');
}

function render(Component, data) {
  game.load();
  game.update({ ...emptySnapshot(), roster: players, ...data });
  globalThis.__testParams = { mode: 'imposter' };
  try {
    return renderToStaticMarkup(React.createElement(Component)).replace(/<!--.*?-->/g, '');
  } finally {
    delete globalThis.__testParams;
  }
}

describe('one or random imposters', () => {
  it('defaults to exactly one and draws every random count from zero through the maximum', () => {
    const one = createMatch('one', DEFAULT_CONFIGS.imposter, players, () => 0.5);
    assert.equal(one.imposterIds.length, 1);
    assert.equal(one.config.randomImposters, false);
    assert.equal(one.config.maxImposters, 1);
    for (let maximum = 0; maximum <= players.length; maximum++) {
      for (let count = 0; count <= maximum; count++) {
        const match = fresh(count, maximum);
        assert.equal(match.imposterIds.length, count);
        assert.equal(new Set(match.imposterIds).size, count);
        assert.equal(validMatch(match), true);
      }
    }
    const ignoredMaximum = createMatch(
      'one',
      { ...DEFAULT_CONFIGS.imposter, maxImposters: 0 },
      players,
      () => 0.5,
    );
    assert.equal(ignoredMaximum.imposterIds.length, 1);
  });

  it('selects distinct imposters with equal partitions rather than repeatedly selecting one player', () => {
    const pairs = new Map();
    for (let first = 0; first < players.length; first++) {
      for (let second = 0; second < players.length - 1; second++) {
        const match = fresh(2, 2, [
          (first + 0.5) / players.length,
          (second + 0.5) / (players.length - 1),
        ]);
        const key = [...match.imposterIds].sort().join();
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }
    assert.equal(pairs.size, 6);
    assert.ok([...pairs.values()].every((count) => count === 2));
  });

  it('reveals all roles before timing while keeping the drawn count and all times private', () => {
    for (const count of [0, 2, 4]) {
      let match = fresh(count);
      for (const player of players) {
        match = act(match, 'READY');
        const card = privateCard(match);
        assert.deepEqual(Object.keys(card), ['role', 'instruction']);
        assert.equal(card.role, match.imposterIds.includes(player.id) ? 'Imposter' : 'Crewmate');
        const restored = decodeSnapshot(JSON.stringify({ ...emptySnapshot(), match })).match;
        assert.deepEqual(restored.imposterIds, match.imposterIds);
        assert.equal(validMatch(restored), true);
        match = act(match, 'HIDE_CARD');
      }
      match = discussion(match);
      const html = render(GameScreen, { match });
      assert.match(html, /aria-label="No imposters"/);
      assert.doesNotMatch(html, /08\.12|Imposter range| · Imposter|Uncaught imposters also win/);
    }
  });

  for (const accused of ['0', '2'])
    it(`awards crewmates only for catching an imposter and all unaccused imposters (${accused})`, () => {
      const match = vote(discussion(fresh(2)), accused);
      const expected = accused === '0' ? ['1', '2', '3'] : ['0', '1'];
      assert.deepEqual(match.winners, expected);
      for (const player of players)
        assert.equal(match.scores[player.id], Number(expected.includes(player.id)));
      assert.equal(validMatch(match), true);
      assert.deepEqual(decodeSnapshot(JSON.stringify({ ...emptySnapshot(), match })).match, match);
      assert.equal(act(match, 'LOCK'), match);
      const html = render(GameScreen, { match });
      assert.equal((html.match(/ · Imposter</g) ?? []).length, 2);
      assert.match(html, accused === '0' ? /Uncaught imposters also win/ : /Imposters win/);
    });

  it('handles no-imposter and all-imposter games, including a wrong No imposters vote', () => {
    for (const [count, accused, expected] of [
      [0, null, ['0', '1', '2', '3']],
      [0, '0', []],
      [2, null, ['0', '1']],
      [4, '0', ['1', '2', '3']],
      [4, null, ['0', '1', '2', '3']],
    ]) {
      const selected = act(discussion(fresh(count)), 'ACCUSE', { id: accused });
      const restored = decodeSnapshot(
        JSON.stringify({ ...emptySnapshot(), match: selected }),
      ).match;
      assert.equal(restored.phase.resume.accusedId, accused);
      const match = act(act(restored, 'RESUME'), 'LOCK');
      assert.deepEqual(match.winners, expected);
      assert.equal(match.awarded, true);
      assert.equal(validMatch(match), true);
      assert.deepEqual(decodeSnapshot(JSON.stringify({ ...emptySnapshot(), match })).match, match);
      const html = render(GameScreen, { match });
      if (count === 0 && accused !== null) assert.match(html, /No winners/);
      if (count === 4) assert.doesNotMatch(html, /Crewmates win/);
    }
  });

  it('rejects impossible settings, duplicated assignments, and inconsistent result scores', () => {
    for (const settings of [
      { maxImposters: -1 },
      { maxImposters: 2.5 },
      { maxImposters: 5 },
      { randomImposters: 'yes' },
    ])
      assert.throws(() =>
        createMatch(
          'bad',
          { ...DEFAULT_CONFIGS.imposter, randomImposters: true, ...settings },
          players,
          () => 0.5,
        ),
      );
    const match = fresh(2, 2);
    for (const imposterIds of [
      ['0', '0'],
      ['0', 'missing'],
      ['0', '1', '2'],
    ])
      assert.equal(validMatch({ ...match, imposterIds }), false);
    const result = vote(discussion(match), '0');
    assert.equal(validMatch({ ...result, winners: ['2', '3'] }), false);
    assert.equal(validMatch({ ...result, scores: { ...result.scores, 0: 1 } }), false);
    const one = discussion(createMatch('one', DEFAULT_CONFIGS.imposter, players, () => 0.5));
    assert.equal(act(one, 'ACCUSE', { id: null }), one);
    assert.doesNotMatch(render(GameScreen, { match: one }), /aria-label="No imposters"/);
  });

  it('shows a compact One/Random choice and bounds the random maximum to the roster', () => {
    let html = render(SetupScreen, {});
    assert.match(html, /One ✓/);
    assert.doesNotMatch(html, /Max imposters/);
    const settings = {
      ...emptySnapshot().settings,
      imposter: { ...DEFAULT_CONFIGS.imposter, randomImposters: true, maxImposters: 12 },
    };
    html = render(SetupScreen, { settings });
    assert.match(html, /Random ✓/);
    assert.match(html, /Max imposters: 4/);
    assert.match(html, /aria-label="Increase Max imposters"[^>]*disabled/);
    settings.imposter.maxImposters = 0;
    html = render(SetupScreen, { settings });
    assert.match(html, /Max imposters: 0/);
    assert.match(html, /aria-label="Decrease Max imposters"[^>]*disabled/);
  });
});
