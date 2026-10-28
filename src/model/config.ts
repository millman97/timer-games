import type { Config, Mode, Player } from './types';

export const DEFAULT_CONFIGS: Record<Mode, Config> = {
  imposter: {
    mode: 'imposter',
    minTargetMs: 0,
    maxTargetMs: 10_000,
    randomImposters: false,
    maxImposters: 1,
  },
  closest: { mode: 'closest', minTargetMs: 0, maxTargetMs: 10_000, rounds: 5 },
  increments: {
    mode: 'increments',
    minTargetMs: 0,
    maxTargetMs: 10_000,
    rounds: 5,
    maxIncrements: 3,
  },
  under: { mode: 'under', minTargetMs: 0, maxTargetMs: 10_000, lives: 3 },
  rush: { mode: 'rush' },
};

export const MODE_INFO: Record<Mode, { title: string; short: string; rules: string[] }> = {
  imposter: {
    title: 'Imposter',
    short: 'Secret roles. Convincing performances.',
    rules: [
      'Read your role privately. Crewmates get the target; imposters get a range.',
      'Everyone takes one Start/Stop turn, then vote for one player.',
      'Catch an imposter: crewmates win. Unaccused imposters always win.',
      'Random game? Vote “No imposters” to win if there are none.',
    ],
  },
  closest: {
    title: 'Closest to the Target',
    short: 'Trust your instinct. Find the exact second.',
    rules: [
      'Take one Start/Stop turn, aiming for the target.',
      'Closest earns 1 point. Ties each score.',
      'Most points wins.',
    ],
  },
  increments: {
    title: 'Closest in X Increments',
    short: 'Split your time. Keep the total in your head.',
    rules: [
      'Reach the target using the shown number of Start/Stop intervals.',
      'Only running time adds up. Pauses don’t count.',
      'Closest earns 1 point; ties each score. Most points wins.',
    ],
  },
  under: {
    title: 'Stay Under the Time',
    short: 'A shared hidden total. Don’t be the one to bust.',
    rules: [
      'Take turns adding time to a hidden total.',
      'Go over the limit: lose a life and reset the total.',
      'Last survivor wins. Solo: play until no lives remain.',
    ],
  },
  rush: {
    title: 'Time Rush',
    short: 'Five targets. Every fraction counts.',
    rules: [
      'Complete five targets in order. Each attempt starts from zero.',
      'Add every miss to your score, whether over or under.',
      'Lowest total wins.',
    ],
  },
};

export function minimumPlayers(mode: Mode): number {
  if (mode === 'rush' || mode === 'under') return 1;
  return mode === 'imposter' ? 3 : 2;
}

export function maximumImposters(playerCount: number): number {
  return Math.max(1, Math.min(12, playerCount));
}

export function validateRoster(players: Player[], minimum = 2): string | null {
  if (players.length < minimum || players.length > 12) return `Choose ${minimum}–12 players.`;
  const names = players.map((player) => player.name.trim().toLocaleLowerCase());
  if (players.some((player) => !player.id || !player.name.trim() || player.name.trim().length > 24))
    return 'Names must contain 1–24 characters.';
  if (new Set(names).size !== names.length) return 'Each player needs a different name.';
  if (new Set(players.map((player) => player.id)).size !== players.length)
    return 'Player IDs must be unique.';
  return null;
}

export function validateConfig(config: Config, playerCount?: number): string | null {
  if (!config || !Object.hasOwn(MODE_INFO, config.mode)) return 'Choose a valid mode.';
  if (config.mode === 'rush') return null;
  if (config.mode === 'imposter') {
    if (typeof config.randomImposters !== 'boolean') return 'Choose one or random imposters.';
    if (
      !Number.isInteger(config.maxImposters) ||
      config.maxImposters < 0 ||
      config.maxImposters > 12
    )
      return 'Choose a maximum of 0–12 imposters.';
    if (config.randomImposters && playerCount !== undefined && config.maxImposters > playerCount)
      return 'The maximum imposters cannot exceed the player count.';
  }
  if (
    !Number.isInteger(config.minTargetMs) ||
    !Number.isInteger(config.maxTargetMs) ||
    config.minTargetMs % 500 ||
    config.maxTargetMs % 500 ||
    config.minTargetMs < 0 ||
    config.maxTargetMs > 60_000 ||
    config.minTargetMs > config.maxTargetMs
  )
    return 'Choose a minimum and maximum from 0–60 seconds in half-second steps.';
  if (config.mode === 'under') {
    if (!Number.isInteger(config.lives) || config.lives < 1 || config.lives > 5)
      return 'Choose 1–5 lives.';
  } else {
    if (config.mode !== 'imposter' && ![3, 5, 10].includes(config.rounds))
      return 'Choose 3, 5, or 10 rounds.';
    if (
      config.mode === 'increments' &&
      (!Number.isInteger(config.maxIncrements) ||
        config.maxIncrements < 2 ||
        config.maxIncrements > 10)
    )
      return 'Choose a maximum of 2–10 intervals.';
  }
  return null;
}
