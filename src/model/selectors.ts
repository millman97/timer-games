import type { Match } from './types';

export const currentId = (match: Match) => match.order[match.turn];
export const currentPlayer = (match: Match) =>
  match.players.find((player) => player.id === currentId(match))!;
export const rolePlayer = (match: Match) =>
  match.players.find((player) => player.id === match.order[match.rolesRevealed])!;
export const seconds = (ms: number) => (ms === 4200 ? '4.20' : `${ms / 1000}`);
export const resultTime = (ms: number) => (ms / 1000).toFixed(2).padStart(5, '0');
export const centiseconds = (ms: number) => Math.round(ms / 10) * 10;
export const isImposter = (match: Match, id: string | null) =>
  id !== null && (match.imposterIds?.includes(id) ?? false);

export function accusationWinners(match: Match, accusedId: string | null): string[] {
  const crewWins =
    isImposter(match, accusedId) || (accusedId === null && match.imposterIds?.length === 0);
  return match.players
    .filter((player) => (isImposter(match, player.id) ? player.id !== accusedId : crewWins))
    .map((player) => player.id);
}

// Deliberately return only what the current private card may expose.
export function privateCard(match: Match): { role: string; instruction: string } {
  if (match.phase.kind !== 'private' || match.config.mode !== 'imposter')
    throw new Error('Private card is not available.');
  const id = match.phase.purpose === 'deal' ? match.order[match.rolesRevealed] : currentId(match);
  return isImposter(match, id)
    ? {
        role: 'Imposter',
        instruction: `Target somewhere from ${seconds(match.range![0])} to ${seconds(match.range![1])} seconds. Blend in.`,
      }
    : { role: 'Crewmate', instruction: `Target ${seconds(match.targetMs)} seconds.` };
}

export function matchWinners(match: Match): string[] {
  if (match.config.mode === 'under')
    return match.players.filter((player) => match.lives[player.id] > 0).map((player) => player.id);
  if (match.config.mode === 'rush') {
    const lowestError = Math.min(...Object.values(match.scores));
    return match.players
      .filter((player) => match.scores[player.id] === lowestError)
      .map((player) => player.id);
  }
  const top = Math.max(...Object.values(match.scores));
  return match.players
    .filter((player) => match.scores[player.id] === top)
    .map((player) => player.id);
}

export function playerNames(match: Match, ids: string[]): string {
  return match.players
    .filter((player) => ids.includes(player.id))
    .map((player) => player.name)
    .join(', ');
}
