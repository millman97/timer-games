import {
  DEFAULT_CONFIGS,
  accusationWinners,
  MODE_INFO,
  minimumPlayers,
  recover,
  targetPools,
  validateConfig,
  validRanges,
  validateRoster,
} from '../model/game.ts';
import type { BoundaryPhase, Config, Match, Mode, Player } from '../model/game.ts';
import { validRushState } from './rushSnapshot';

export type Snapshot = {
  version: 6;
  roster: Player[];
  settings: Record<Mode, Config>;
  match: Match | null;
};
export interface StorageAdapter {
  read(): string | null;
  write(value: string): void;
  clear(): void;
  subscribe?(listener: () => void): () => void;
}
export const STORAGE_KEY = 'timer-games.snapshot';
export function emptySnapshot(): Snapshot {
  return {
    version: 6,
    roster: [],
    settings: structuredClone(DEFAULT_CONFIGS),
    match: null,
  };
}

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (v: unknown, min = 0): v is number =>
  Number.isSafeInteger(v) && (v as number) >= min;
function validPlayers(v: unknown, min: number): v is Player[] {
  return (
    Array.isArray(v) &&
    v.every((p) => object(p) && typeof p.id === 'string' && typeof p.name === 'string') &&
    !validateRoster(v, min)
  );
}
function validContributions(value: unknown, ids: string[], total: number): boolean {
  if (!Array.isArray(value)) return false;
  let sum = 0;
  for (const entry of value) {
    if (!object(entry) || !ids.includes(entry.playerId as string) || !integer(entry.elapsedMs))
      return false;
    sum += entry.elapsedMs;
    if (!Number.isSafeInteger(sum) || entry.cumulativeMs !== sum) return false;
  }
  return sum === total;
}
function validBoundary(value: unknown, ids: string[]): value is BoundaryPhase {
  if (!object(value)) return false;
  switch (value.kind) {
    case 'roleHandoff':
      return true;
    case 'handoff':
      return value.replay === undefined || typeof value.replay === 'boolean';
    case 'saved':
      return (
        ['saved', 'safe', 'bust'].includes(value.outcome as string) &&
        (value.outcome !== 'bust' ||
          (integer(value.bustMs) && validContributions(value.bustContributions, ids, value.bustMs)))
      );
    case 'accusation':
      return value.accusedId === null || ids.includes(value.accusedId as string);
    case 'matchResults':
      return (
        value.bustMs === undefined ||
        (integer(value.bustMs, 1) && validContributions(value.bustContributions, ids, value.bustMs))
      );
    case 'discussion':
    case 'roundResults':
      return true;
    default:
      return false;
  }
}
export function validMatch(value: unknown): value is Match {
  if (!object(value) || typeof value.id !== 'string' || !value.id || !object(value.config))
    return false;
  const config = value.config as Config;
  if (
    !validPlayers(value.players, minimumPlayers(config.mode)) ||
    validateConfig(config, value.players.length)
  )
    return false;
  const ids = value.players.map((p) => p.id);
  if (
    !Array.isArray(value.order) ||
    value.order.length !== ids.length ||
    new Set(value.order).size !== ids.length ||
    !value.order.every((id) => ids.includes(id))
  )
    return false;
  if (
    !integer(value.round, 1) ||
    ((config.mode === 'closest' || config.mode === 'increments') && value.round > config.rounds) ||
    !integer(value.turn) ||
    value.turn >= ids.length
  )
    return false;
  if (!integer(value.rolesRevealed) || value.rolesRevealed > ids.length) return false;
  if (config.mode !== 'imposter' && value.rolesRevealed !== 0) return false;
  if (config.mode === 'imposter' && value.round !== 1) return false;
  if (config.mode === 'rush') {
    if (!integer(value.targetMs, 1000) || value.targetMs > 5000 || value.targetMs % 1000)
      return false;
  } else {
    if (!integer(value.targetMs, config.minTargetMs) || value.targetMs > config.maxTargetMs)
      return false;
    const { regular, funny } = targetPools(config);
    if (!regular.includes(value.targetMs) && !funny.includes(value.targetMs)) return false;
  }
  if (config.mode === 'increments') {
    if (!integer(value.increments, 2) || value.increments > config.maxIncrements) return false;
  } else if (value.increments !== undefined) return false;
  if (config.mode === 'imposter') {
    if (
      !Array.isArray(value.imposterIds) ||
      (config.randomImposters
        ? value.imposterIds.length > config.maxImposters
        : value.imposterIds.length !== 1) ||
      new Set(value.imposterIds).size !== value.imposterIds.length ||
      !value.imposterIds.every((id) => ids.includes(id)) ||
      !Array.isArray(value.range) ||
      value.range.length !== 2
    )
      return false;
    const [low, high] = value.range;
    if (!validRanges(value.targetMs, config).some(([a, b]) => a === low && b === high))
      return false;
  } else if (
    value.imposterIds !== undefined ||
    value.range !== undefined ||
    value.accusedId !== undefined
  ) {
    return false;
  }
  for (const field of ['scores', 'lives'] as const) {
    const map = value[field];
    if (
      !object(map) ||
      Object.keys(map).length !== ids.length ||
      !ids.every((id) => integer(map[id]))
    )
      return false;
  }
  if (
    !object(value.attempts) ||
    !Object.entries(value.attempts).every(([id, time]) => ids.includes(id) && integer(time))
  )
    return false;
  if (
    !Array.isArray(value.intervals) ||
    !value.intervals.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)
  )
    return false;
  if (value.intervals.length >= (config.mode === 'increments' ? (value.increments as number) : 1))
    return false;
  if (
    !integer(value.totalMs) ||
    value.totalMs > value.targetMs ||
    typeof value.awarded !== 'boolean' ||
    !Array.isArray(value.winners) ||
    !value.winners.every((id) => ids.includes(id))
  )
    return false;
  if (
    value.accusedId !== undefined &&
    value.accusedId !== null &&
    !ids.includes(value.accusedId as string)
  )
    return false;
  if (value.accusedId === null && (config.mode !== 'imposter' || !config.randomImposters))
    return false;
  if (!validContributions(value.contributions, ids, value.totalMs)) return false;
  if (config.mode !== 'under' && (value.contributions as unknown[]).length) return false;
  const phase = value.phase;
  if (!object(phase)) return false;
  const validPhase =
    validBoundary(phase, ids) ||
    (phase.kind === 'private' && ['deal', 'replay'].includes(phase.purpose as string)) ||
    ['ready', 'running', 'paused'].includes(phase.kind as string) ||
    (phase.kind === 'interrupted' &&
      typeof phase.replay === 'boolean' &&
      validBoundary(phase.resume, ids));
  if (!validPhase) return false;
  const kind = phase.kind === 'interrupted' ? (phase.resume as BoundaryPhase).kind : phase.kind;
  const boundary = (phase.kind === 'interrupted' ? phase.resume : phase) as BoundaryPhase;
  if (
    boundary.kind === 'accusation' &&
    boundary.accusedId === null &&
    (config.mode !== 'imposter' || !config.randomImposters)
  )
    return false;
  if (
    ['private', 'roleHandoff', 'discussion', 'accusation'].includes(kind as string) &&
    config.mode !== 'imposter'
  )
    return false;
  if (kind === 'paused' && config.mode !== 'increments' && config.mode !== 'rush') return false;
  if (kind === 'roundResults' && config.mode !== 'closest' && config.mode !== 'increments')
    return false;
  if (kind === 'roundResults' && !value.awarded) return false;
  if (config.mode === 'imposter') {
    const dealing =
      kind === 'roleHandoff' || (phase.kind === 'private' && phase.purpose === 'deal');
    if (
      dealing
        ? value.rolesRevealed >= ids.length || value.turn !== 0
        : value.rolesRevealed !== ids.length
    )
      return false;
  }
  if (new Set(value.winners).size !== value.winners.length) return false;
  if (value.intervals.length && !['paused', 'running'].includes(phase.kind as string)) return false;
  if (kind === 'paused' && config.mode !== 'rush' && value.intervals.length === 0) return false;
  if (kind === 'saved' && boundary.kind === 'saved') {
    if (config.mode === 'under') {
      if (!['safe', 'bust'].includes(boundary.outcome)) return false;
      if (
        boundary.outcome === 'bust' &&
        (boundary.bustMs! <= value.targetMs || value.totalMs !== 0)
      )
        return false;
    } else if (boundary.outcome !== 'saved') return false;
  }
  if (config.mode === 'rush')
    return validRushState(value as unknown as Match, kind as string, boundary);
  if (value.rushAttempts !== undefined) return false;
  if (config.mode !== 'under') {
    const times = value.attempts as Record<string, number>;
    const allFinished = ['discussion', 'accusation', 'roundResults', 'matchResults'].includes(
      kind as string,
    );
    const expected = allFinished
      ? ids
      : value.order.slice(0, value.turn + (kind === 'saved' ? 1 : 0));
    if (
      Object.keys(times).length !== expected.length ||
      !expected.every((id) => Object.hasOwn(times, id))
    )
      return false;
    if (
      ['closest', 'increments'].includes(config.mode) &&
      !Object.values(times).every((time) => time % 10 === 0)
    )
      return false;
    const scores = value.scores as Record<string, number>;
    const round = value.round;
    if (!ids.every((id) => scores[id] <= round)) return false;
    if (['roundResults', 'matchResults'].includes(kind as string) !== value.awarded) return false;
    if (value.awarded && value.winners.length === 0 && config.mode !== 'imposter') return false;
    if (kind === 'matchResults' && config.mode === 'imposter' && value.accusedId === undefined)
      return false;
    if (config.mode === 'imposter' && kind === 'matchResults') {
      const winners = accusationWinners(
        value as unknown as Match,
        value.accusedId as string | null,
      );
      const savedWinners = value.winners;
      if (
        winners.length !== savedWinners.length ||
        !winners.every((id) => savedWinners.includes(id))
      )
        return false;
      if (!ids.every((id) => scores[id] === Number(winners.includes(id)))) return false;
    }
  }
  if (config.mode === 'under') {
    const lives = value.lives as Record<string, number>;
    if (!ids.every((id) => lives[id] <= config.lives)) return false;
    const living = ids.filter((id) => lives[id] > 0);
    const solo = ids.length === 1;
    if (kind === 'matchResults' ? living.length !== (solo ? 0 : 1) : living.length < (solo ? 1 : 2))
      return false;
    if (
      ['handoff', 'ready', 'running'].includes(kind as string) &&
      lives[value.order[value.turn]] <= 0
    )
      return false;
    const livesLost = ids.reduce((sum, id) => sum + config.lives - lives[id], 0);
    const bustResult =
      (boundary.kind === 'saved' && boundary.outcome === 'bust') || kind === 'matchResults';
    if (value.round !== livesLost + (bustResult ? 0 : 1)) return false;
    if (
      kind === 'matchResults' &&
      (boundary.kind !== 'matchResults' ||
        !integer(boundary.bustMs) ||
        boundary.bustMs <= value.targetMs)
    )
      return false;
    if (Object.keys(value.attempts).length || value.intervals.length || value.awarded) return false;
  }
  return true;
}

export function decodeSnapshot(raw: string): Snapshot {
  const value: unknown = JSON.parse(raw);
  if (!object(value)) throw new Error('Saved data is corrupt. Reset it explicitly to continue.');
  if (value.version !== 6)
    throw new Error(
      'This save uses a different development version. Clear saved game data to start fresh.',
    );
  if (!validPlayers(value.roster, 0) || !object(value.settings))
    throw new Error('Saved preferences are corrupt. Reset saved data to continue.');
  for (const mode of Object.keys(MODE_INFO) as Mode[]) {
    const config = value.settings[mode];
    if (!object(config) || config.mode !== mode || validateConfig(config as Config))
      throw new Error('Saved settings are corrupt. Reset saved data to continue.');
  }
  if (value.match !== null && !validMatch(value.match))
    throw new Error(
      'Saved match is corrupt. It has been kept until you explicitly reset saved data.',
    );
  const result = value as unknown as Snapshot;
  return { ...result, match: result.match ? recover(result.match) : null };
}
