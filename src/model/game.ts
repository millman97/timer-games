import { minimumPlayers, validateConfig, validateRoster } from './config';
import { assignments } from './targets';
import type { Config, Match, Player, Random } from './types';

export type * from './types';
export {
  DEFAULT_CONFIGS,
  MODE_INFO,
  minimumPlayers,
  maximumImposters,
  validateConfig,
  validateRoster,
} from './config';
export { assignments, targetPools, validRanges } from './targets';
export {
  currentId,
  currentPlayer,
  rolePlayer,
  seconds,
  resultTime,
  centiseconds,
  privateCard,
  isImposter,
  accusationWinners,
  matchWinners,
  playerNames,
} from './selectors';
export { transition, recover } from './transitions';
export { RUSH_TARGETS, rushBreakdown, rushScore, rushTarget } from './rush';
export type { RushAttemptResult } from './rush';

export function createMatch(id: string, config: Config, players: Player[], random: Random): Match {
  const error =
    validateRoster(players, minimumPlayers(config.mode)) || validateConfig(config, players.length);
  if (error) throw new Error(error);
  const frozenPlayers = players.map((player) => ({ ...player, name: player.name.trim() }));
  return {
    id,
    config: { ...config },
    players: frozenPlayers,
    round: 1,
    order: players.map((player) => player.id),
    turn: 0,
    rolesRevealed: 0,
    ...assignments(config, players, random),
    attempts: {},
    ...(config.mode === 'rush' ? { rushAttempts: {} } : {}),
    intervals: [],
    scores: Object.fromEntries(players.map((player) => [player.id, 0])),
    lives: Object.fromEntries(
      players.map((player) => [player.id, config.mode === 'under' ? config.lives : 0]),
    ),
    totalMs: 0,
    contributions: [],
    awarded: false,
    winners: [],
    phase: { kind: config.mode === 'imposter' ? 'roleHandoff' : 'handoff' },
  };
}
