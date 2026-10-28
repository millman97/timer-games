import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createMatch,
  currentId,
  DEFAULT_CONFIGS,
  privateCard,
  recover,
  rolePlayer,
  transition,
} from '../src/model/game.ts';
import { decodeSnapshot, emptySnapshot, validMatch } from '../src/utils/snapshot.ts';
import { GameStore } from '../src/stores/GameStore.ts';
import { game } from '../src/stores/game.ts';
import GameScreen from '../src/screens/GameScreen/GameScreen.tsx';
import SetupScreen from '../src/screens/SetupScreen/SetupScreen.tsx';

const players = [
  { id: 'a', name: 'Alex' },
  { id: 'b', name: 'Sam' },
  { id: 'c', name: 'Charlie' },
];
const random = () => 0.77;
const fresh = (mode, config = {}) =>
  createMatch(
    'first',
    {
      ...DEFAULT_CONFIGS[mode],
      ...(mode === 'under' ? { minTargetMs: 10000, maxTargetMs: 10000 } : {}),
      ...config,
    },
    players,
    random,
  );
const act = (match, type, extra = {}) => transition(match, { type, ...extra }, random);
const takeTurn = (m, elapsed) => act(act(act(m, 'READY'), 'START'), 'STOP', { elapsed });
function deal(m) {
  while (m.phase.kind === 'roleHandoff') m = act(act(m, 'READY'), 'HIDE_CARD');
  return m;
}
function finishImposter(m) {
  m = deal(m);
  for (let i = 0; i < players.length; i++) m = act(takeTurn(m, 8123), 'CONTINUE');
  return act(act(m, 'ACCUSE', { id: m.imposterIds[0] }), 'LOCK');
}
function render(m, Component = GameScreen) {
  game.load();

  game.update({ ...emptySnapshot(), roster: players, match: m });
  return renderToStaticMarkup(React.createElement(Component)).replace(/<!--.*?-->/g, '');
}
describe('Imposter opening reveals and single-game results', () => {
  it('reveals every private card before any timing and never repeats cards between ordinary turns', () => {
    let m = fresh('imposter');
    assert.equal('rounds' in m.config, false);
    for (let i = 0; i < players.length; i++) {
      assert.equal(m.phase.kind, 'roleHandoff');
      assert.equal(rolePlayer(m).id, players[i].id);
      assert.equal(act(m, 'START'), m);
      m = act(m, 'READY');
      assert.equal(m.phase.kind, 'private');
      assert.equal(m.phase.purpose, 'deal');
      const card = privateCard(m);
      assert.equal(card.role, m.imposterIds.includes(players[i].id) ? 'Imposter' : 'Crewmate');
      assert.equal(act(m, 'START'), m);
      m = act(m, 'HIDE_CARD');
      assert.equal(m.rolesRevealed, i + 1);
      assert.equal(m.turn, 0);
      assert.deepEqual(m.attempts, {});
      assert.equal(validMatch(m), true);
      assert.equal(act(m, 'HIDE_CARD'), m);
    }
    for (let i = 0; i < players.length; i++) {
      assert.equal(currentId(m), players[i].id);
      assert.equal(m.phase.kind, 'handoff');
      m = act(m, 'READY');
      assert.equal(m.phase.kind, 'ready');
      assert.throws(() => privateCard(m));
      m = act(act(m, 'START'), 'STOP', { elapsed: 8000 });
      m = act(m, 'CONTINUE');
    }
    assert.equal(m.phase.kind, 'discussion');
    const result = act(act(m, 'ACCUSE', { id: m.imposterIds[0] }), 'LOCK');
    assert.equal(result.phase.kind, 'matchResults');
    assert.equal(act(result, 'NEXT_ROUND'), result);
    assert.equal(act(result, 'LOCK'), result);
    const html = render(result);
    assert.match(html, /GAME COMPLETE|Crewmates win/);
    assert.match(html, /Play again · same settings/);
    assert.match(html, /Edit settings/);
    assert.doesNotMatch(html, /Next round|Final scoreboard|ROUND 1/);
  });
  it('resumes an interrupted opening reveal without skipping a card or exposing the last card', () => {
    let m = act(act(fresh('imposter'), 'READY'), 'HIDE_CARD');
    m = act(m, 'READY');
    assert.equal(rolePlayer(m).id, 'b');
    const restored = decodeSnapshot(JSON.stringify({ ...emptySnapshot(), match: m })).match;
    assert.equal(restored.rolesRevealed, 1);
    assert.equal(restored.phase.kind, 'interrupted');
    assert.doesNotMatch(render(restored), /PRIVATE CARD|Crewmate|somewhere from/);
    m = act(act(restored, 'RESUME'), 'READY');
    assert.equal(rolePlayer(m).id, 'b');
    assert.equal(m.phase.purpose, 'deal');
    m = deal(act(m, 'HIDE_CARD'));
    assert.equal(m.rolesRevealed, 3);
    assert.equal(m.turn, 0);
  });
  it('replays with the frozen roster/settings, fresh assignments and reset results, only once', () => {
    let raw = null,
      calls = 0;
    const engine = new GameStore(
      {
        read: () => raw,
        write: (value) => {
          raw = value;
        },
        clear() {},
      },
      () => 0,
      () => {
        calls++;
        return calls <= 4 ? 0 : 0.99;
      },
    );
    engine.load();
    engine.update({ ...emptySnapshot(), roster: players });
    engine.startMatch('first', {
      ...DEFAULT_CONFIGS.imposter,
      minTargetMs: 1500,
      maxTargetMs: 25000,
    });
    const result = finishImposter(engine.getSnapshot().data.match);
    engine.update({
      ...engine.getSnapshot().data,
      roster: [
        { id: 'x', name: 'X' },
        { id: 'y', name: 'Y' },
        { id: 'z', name: 'Z' },
      ],
      match: result,
    });
    assert.equal(engine.replayImposter('second'), true);
    const next = engine.getSnapshot().data.match;
    assert.deepEqual(next.players, players);
    assert.deepEqual(next.config, result.config);
    assert.notEqual(next.targetMs, result.targetMs);
    assert.notDeepEqual(next.imposterIds, result.imposterIds);
    assert.deepEqual(next.scores, { a: 0, b: 0, c: 0 });
    assert.deepEqual(next.attempts, {});
    assert.equal(next.rolesRevealed, 0);
    assert.equal(next.phase.kind, 'roleHandoff');
    assert.equal(engine.replayImposter('duplicate'), false);
    assert.equal(calls, 8);
    assert.equal(JSON.parse(raw).version, 6);
  });
  it('setup has no rounds selector and editing starts with the completed game’s settings', () => {
    const result = finishImposter(fresh('imposter', { minTargetMs: 1500, maxTargetMs: 25000 }));
    const html = render(result, SetupScreen);
    assert.match(html, /One definite imposter/);
    assert.match(html, /Minimum · seconds: 1\.5/);
    assert.match(html, /Maximum · seconds: 25/);
    assert.doesNotMatch(html, /Rounds|Half-second targets/);
  });
  it('replays an interrupted timing attempt with the same already-dealt roles', () => {
    let m = takeTurn(deal(fresh('imposter')), 8123);
    m = act(act(act(m, 'CONTINUE'), 'READY'), 'START');
    const restored = recover(m);
    assert.equal(restored.rolesRevealed, 3);
    assert.equal(currentId(restored), 'b');
    assert.deepEqual(restored.attempts, { a: 8123 });
    m = act(act(restored, 'RESUME'), 'READY');
    assert.equal(m.phase.kind, 'private');
    assert.equal(m.phase.purpose, 'replay');
    assert.equal(act(m, 'HIDE_CARD').phase.kind, 'ready');
  });
});

describe('Stay Under bust breakdown', () => {
  it('keeps each safe addition hidden, then reveals all contributions and cumulative times including repeat players', () => {
    let m = fresh('under');
    for (const duration of [1000, 2000, 3000, 4000]) {
      m = takeTurn(m, duration);
      assert.equal(m.phase.outcome, 'safe');
      assert.doesNotMatch(render(m), /CONTRIBUTIONS SINCE|cumulative|Added \+/);
      m = act(m, 'CONTINUE');
    }
    m = takeTurn(m, 1);
    const contributions = [
      { playerId: 'a', elapsedMs: 1000, cumulativeMs: 1000 },
      { playerId: 'b', elapsedMs: 2000, cumulativeMs: 3000 },
      { playerId: 'c', elapsedMs: 3000, cumulativeMs: 6000 },
      { playerId: 'a', elapsedMs: 4000, cumulativeMs: 10000 },
      { playerId: 'b', elapsedMs: 1, cumulativeMs: 10001 },
    ];
    assert.deepEqual(m.phase.bustContributions, contributions);
    assert.equal(m.phase.bustMs, 10001);
    assert.equal(m.totalMs, 0);
    assert.deepEqual(m.contributions, []);
    assert.equal(m.lives.b, 2);
    const html = render(m);
    for (const name of ['Alex', 'Sam', 'Charlie']) assert.match(html, new RegExp(name));
    assert.match(html, /Added \+0.001 s · cumulative 10.001 s/);
    assert.match(html, /Added \+4.000 s · cumulative 10.000 s/);
    const restored = decodeSnapshot(JSON.stringify({ ...emptySnapshot(), match: m })).match;
    m = act(restored, 'RESUME');
    assert.deepEqual(m.phase.bustContributions, contributions);
    assert.equal(m.lives.b, 2);
    assert.equal(validMatch(m), true);
    m = act(m, 'CONTINUE');
    assert.doesNotMatch(render(m), /10.001|Added \+|CONTRIBUTIONS SINCE/);
    m = takeTurn(m, 123);
    assert.deepEqual(m.contributions, [{ playerId: 'c', elapsedMs: 123, cumulativeMs: 123 }]);
  });
  it('shows the last bust’s breakdown alongside the final survivor', () => {
    let m = act(takeTurn(fresh('under', { lives: 1 }), 10001), 'CONTINUE');
    m = act(takeTurn(m, 800), 'CONTINUE');
    m = takeTurn(m, 10000);
    assert.equal(m.phase.kind, 'matchResults');
    assert.deepEqual(m.winners, ['b']);
    assert.deepEqual(m.phase.bustContributions, [
      { playerId: 'b', elapsedMs: 800, cumulativeMs: 800 },
      { playerId: 'c', elapsedMs: 10000, cumulativeMs: 10800 },
    ]);
    assert.match(render(m), /Sam wins/);
    assert.match(render(m), /cumulative 10.800 s/);
    const restored = decodeSnapshot(JSON.stringify({ ...emptySnapshot(), match: m })).match;
    assert.deepEqual(restored.phase, m.phase);
    assert.deepEqual(restored.lives, m.lives);
  });
  it('discards interrupted time while retaining committed additions and rejects inconsistent saved sums', () => {
    let m = act(act(act(takeTurn(fresh('under'), 9800), 'CONTINUE'), 'READY'), 'START');
    m = act(recover(m), 'RESUME');
    m = takeTurn(m, 201);
    assert.deepEqual(
      m.phase.bustContributions.map((entry) => entry.elapsedMs),
      [9800, 201],
    );
    const corrupted = structuredClone(m);
    corrupted.phase.bustContributions[0].cumulativeMs = 123;
    assert.equal(validMatch(corrupted), false);
    assert.throws(
      () => decodeSnapshot(JSON.stringify({ ...emptySnapshot(), match: corrupted })),
      /corrupt/,
    );
  });
});
