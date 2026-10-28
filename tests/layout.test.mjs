import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HomeScreen from '../src/screens/HomeScreen/HomeScreen.tsx';
import SetupScreen from '../src/screens/SetupScreen/SetupScreen.tsx';
import RosterScreen from '../src/screens/RosterScreen/RosterScreen.tsx';
import GameScreen from '../src/screens/GameScreen/GameScreen.tsx';
import { homeLayout, needsScroll } from '../src/utils/layout.ts';
import { game } from '../src/stores/game.ts';
import { createMatch, DEFAULT_CONFIGS, MODE_INFO, transition } from '../src/model/game.ts';
import { emptySnapshot } from '../src/utils/snapshot.ts';

const players = [
  { id: 'a', name: 'Alex' },
  { id: 'b', name: 'Sam' },
  { id: 'c', name: 'Charlie' },
];
function render(Component, match = null) {
  game.load();

  game.update({ ...emptySnapshot(), roster: players, match });
  return renderToStaticMarkup(React.createElement(Component)).replace(/<!--.*?-->/g, '');
}
const fresh = (mode) => createMatch('layout', DEFAULT_CONFIGS[mode], players, () => 0.7);
const act = (m, type, extra = {}) => transition(m, { type, ...extra }, () => 0.7);

describe('compact screen design', () => {
  it('session-only play has no storage indicators, prompts, or saving-related disabled controls', () => {
    for (const Component of [HomeScreen, SetupScreen, RosterScreen, GameScreen]) {
      const html = render(Component, fresh('closest'));
      assert.equal(game.getSnapshot().memoryOnly, true); // Native adapter has no persistent storage.
      assert.doesNotMatch(
        html,
        /Session only|Saving unavailable|Retry saving|Continue without resume|role="alert"/i,
      );
      if (Component === HomeScreen) assert.doesNotMatch(html, /disabled/);
      if (Component === SetupScreen)
        assert.doesNotMatch(html, /aria-label="Start game"[^>]*disabled/);
      if (Component === RosterScreen)
        assert.doesNotMatch(html, /aria-label="Save players"[^>]*disabled/);
    }
  });
  it('Home has exactly five game choices, Clear data, and no scrolling or expanded secondary content', () => {
    const html = render(HomeScreen);
    for (const mode of Object.values(MODE_INFO))
      assert.match(html, new RegExp(`aria-label="Play ${mode.title}"`));
    assert.equal((html.match(/aria-label="Play /g) || []).length, 5);
    assert.match(html, /aria-label="Clear data"/);
    assert.doesNotMatch(
      html,
      /<main|00\.00|Edit players|HOW TO PLAY|THE USUAL|SET THE|shared.phone party game|role="dialog"|Available offline|Offline setup|Update available|Update app/i,
    );
  });
  it('Resume replaces the corresponding menu action without adding another game card', () => {
    const html = render(HomeScreen, fresh('under'));
    assert.match(html, /aria-label="Resume Stay Under the Time"/);
    assert.equal((html.match(/aria-label="(?:Play|Resume) /g) || []).length, 5);
    assert.doesNotMatch(html, /<main/);
  });
  it('Home stays fixed in compact landscape and uses a two-column layout policy', () => {
    globalThis.__testDimensions = { width: 667, height: 375 };
    try {
      assert.doesNotMatch(render(HomeScreen), /<main/);
    } finally {
      delete globalThis.__testDimensions;
    }
    assert.equal(homeLayout(390, 844).columns, 1);
    assert.deepEqual(homeLayout(667, 375), { columns: 2, compact: true });
    assert.equal(homeLayout(820, 1180).columns, 2);
  });
  it('enables scroll only after measurement proves actual overflow', () => {
    assert.equal(needsScroll(0, 500), false);
    assert.equal(needsScroll(500, 300), false);
    assert.equal(needsScroll(500, 500), false);
    assert.equal(needsScroll(500, 501), false);
    assert.equal(needsScroll(500, 502), true);
    assert.equal(needsScroll(240, 500), true);
  });
  it('setup keeps rules on demand and players in one compact editor entry', () => {
    for (const mode of Object.keys(MODE_INFO)) {
      globalThis.__testParams = { mode };
      try {
        const html = render(SetupScreen);
        assert.match(html, /aria-label="Rules"/);
        assert.match(html, /aria-label="Edit players"/);
        const back = html.indexOf('aria-label="Back"');
        const start = html.indexOf(
          `aria-label="${mode === 'imposter' ? 'Start game' : 'Start match'}"`,
        );
        assert.ok(back > html.indexOf('</main>'), 'Back stays in the anchored footer');
        assert.ok(start > back, 'Start follows Back in the same footer');
        assert.equal((html.match(/aria-label="Back"/g) || []).length, 1);
        assert.doesNotMatch(html, /Alex|Sam|Charlie|HOW TO PLAY|Don’t count aloud|role="dialog"/);
        assert.match(html, /data-scroll-enabled="false"/);
      } finally {
        delete globalThis.__testParams;
      }
    }
  });
  it('player editor has one field and options button per player without expanded management buttons', () => {
    const html = render(RosterScreen);
    assert.equal((html.match(/<input/g) || []).length, 3);
    for (const p of players) assert.match(html, new RegExp(`aria-label="Options for ${p.name}"`));
    assert.match(html, /aria-label="Save players"/);
    const cancel = html.indexOf('aria-label="Cancel"');
    assert.ok(cancel > html.indexOf('</main>'), 'Cancel stays in the anchored footer');
    assert.ok(html.indexOf('aria-label="Save players"') > cancel);
    assert.doesNotMatch(html, /Move up|Move down|Remove player|role="dialog"/);
  });
  it('running controls cannot open rules/menu overlays and reveal no hidden elapsed time', () => {
    const m = act(act(fresh('closest'), 'READY'), 'START');
    const html = render(GameScreen, m);
    assert.match(html, /aria-label="Menu"[^>]*disabled/);
    assert.match(html, /aria-label="Rules"[^>]*disabled/);
    assert.match(html, /aria-label="Stop"/);
    assert.doesNotMatch(html, /role="dialog"|Save &amp; leave|Abandon match|Attempt saved|elapsed/);
  });
  it('a saved turn has one next action and no artificial timer spacer or expanded match controls', () => {
    const m = act(act(act(fresh('closest'), 'READY'), 'START'), 'STOP', { elapsed: 8123 });
    const html = render(GameScreen, m);
    assert.match(html, /Attempt saved/);
    assert.match(html, /aria-label="Continue"/);
    assert.doesNotMatch(html, /RELEASE THE TIMER|8\.12|Save &amp; leave|Abandon match/);
  });
  it('round results present scores and attempts together, with each player appearing once', () => {
    let m = fresh('closest');
    for (const elapsed of [1000, 2000, 3000])
      m = act(act(act(act(m, 'READY'), 'START'), 'STOP', { elapsed }), 'CONTINUE');
    const html = render(GameScreen, m);
    assert.equal(m.phase.kind, 'roundResults');
    for (const p of players)
      assert.equal((html.match(new RegExp(`>${p.name}<`, 'g')) || []).length, 1);
    assert.match(html, /Error .*points/);
    assert.doesNotMatch(html, /SCOREBOARD/);
  });
});
