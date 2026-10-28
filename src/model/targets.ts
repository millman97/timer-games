import type { Config, Player, Random, TargetRange } from './types';
import { RUSH_TARGETS } from './rush';

function randomUnit(random: Random): number {
  const value = random();
  if (value < 0 || value >= 1 || !Number.isFinite(value))
    throw new Error('Random source must return [0, 1).');
  return value;
}

function choose<T>(values: T[], random: Random): T {
  return values[Math.floor(randomUnit(random) * values.length)];
}

function chooseImposters(players: Player[], count: number, random: Random): string[] {
  const remaining = [...players];
  const imposters: string[] = [];
  while (imposters.length < count) {
    const player = choose(remaining, random);
    imposters.push(player.id);
    remaining.splice(remaining.indexOf(player), 1);
  }
  return imposters;
}

export function validRanges(targetMs: number, config: TargetRange): [number, number][] {
  const width = Math.min(4000, config.maxTargetMs - config.minTargetMs);
  const ranges: [number, number][] = [];
  for (let low = config.minTargetMs; low + width <= config.maxTargetMs; low += 500) {
    if (low <= targetMs && low + width >= targetMs) ranges.push([low, low + width]);
  }
  return ranges;
}

export function targetPools(config: TargetRange) {
  const withinRange = (value: number) => value >= config.minTargetMs && value <= config.maxTargetMs;
  const regular = new Set<number>();
  for (let value = config.minTargetMs; value <= config.maxTargetMs; value += 500)
    regular.add(value);
  for (let digit = 1; digit <= 9; digit++) {
    // Repeated significant digits at tenths/hundredths precision, including
    // 0.dd, d.d, d.dd, dd.d, and dd.dd. Whole values are already in the grid.
    for (const multiplier of [110, 1100, 1110, 11100, 11110]) {
      const value = digit * multiplier;
      if (withinRange(value)) regular.add(value);
    }
  }
  const funny = [4200];
  for (let wholeMs = 0; wholeMs < config.maxTargetMs; wholeMs += 1000) {
    funny.push(wholeMs + 670, wholeMs + 690);
  }
  return {
    regular: [...regular].sort((a, b) => a - b),
    funny: funny.filter(withinRange).sort((a, b) => a - b),
  };
}

export function assignments(config: Config, players: Player[], random: Random) {
  if (config.mode === 'rush') return { targetMs: RUSH_TARGETS[0] };

  const { regular, funny } = targetPools(config);
  const pool = funny.length > 0 && randomUnit(random) < 1 / 20 ? funny : regular;
  const targetMs = choose(pool, random);
  if (config.mode === 'increments')
    return {
      targetMs,
      increments: choose(
        Array.from({ length: config.maxIncrements - 1 }, (_, i) => i + 2),
        random,
      ),
    };
  if (config.mode !== 'imposter') return { targetMs };
  const imposterCount = config.randomImposters
    ? Math.floor(randomUnit(random) * (config.maxImposters + 1))
    : 1;
  return {
    targetMs,
    imposterIds: chooseImposters(players, imposterCount, random),
    range: choose(validRanges(targetMs, config), random),
  };
}
