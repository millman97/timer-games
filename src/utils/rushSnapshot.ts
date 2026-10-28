import { RUSH_TARGETS, rushScore, rushTarget } from '../model/rush';
import type { BoundaryPhase, Match } from '../model/types';

export function validRushState(match: Match, kind: string, boundary: BoundaryPhase): boolean {
  const attempts = match.rushAttempts;
  if (!attempts || typeof attempts !== 'object' || Array.isArray(attempts)) return false;
  if (!['handoff', 'ready', 'running', 'paused', 'saved', 'matchResults'].includes(kind))
    return false;
  if (match.round !== 1 || match.totalMs !== 0 || match.intervals.length) return false;
  if (Object.keys(match.attempts).length || Object.values(match.lives).some((lives) => lives !== 0))
    return false;
  if (match.imposterIds !== undefined || match.range !== undefined || match.accusedId !== undefined)
    return false;
  if (
    (boundary.kind === 'saved' || boundary.kind === 'matchResults') &&
    boundary.bustMs !== undefined
  )
    return false;

  for (const [id, times] of Object.entries(attempts)) {
    if (
      !match.order.includes(id) ||
      !Array.isArray(times) ||
      times.length < 1 ||
      times.length > RUSH_TARGETS.length
    )
      return false;
    if (!times.every((time) => Number.isSafeInteger(time) && time >= 0 && time % 10 === 0))
      return false;
  }

  const finished = kind === 'matchResults';
  const currentFinished = kind === 'saved' || finished;
  const currentAttempts = attempts[match.order[match.turn]] ?? [];
  if (
    currentFinished
      ? currentAttempts.length !== RUSH_TARGETS.length
      : currentAttempts.length >= RUSH_TARGETS.length
  )
    return false;
  if (kind === 'paused' && currentAttempts.length === 0) return false;
  if (match.targetMs !== rushTarget(currentAttempts.length)) return false;
  if (finished && match.turn !== match.order.length - 1) return false;

  for (const [index, id] of match.order.entries()) {
    const times = attempts[id] ?? [];
    if (index < match.turn && times.length !== RUSH_TARGETS.length) return false;
    if (index > match.turn && times.length !== 0) return false;
    const expectedScore = times.length === RUSH_TARGETS.length ? rushScore(times) : 0;
    if (match.scores[id] !== expectedScore) return false;
  }

  if (match.awarded !== finished) return false;
  if (!finished) return match.winners.length === 0;

  const best = Math.min(...Object.values(match.scores));
  const winners = match.players.filter((player) => match.scores[player.id] === best);
  return (
    match.winners.length === winners.length &&
    winners.every((player) => match.winners.includes(player.id))
  );
}
