import { assignments } from './targets';
import { accusationWinners, centiseconds, currentId, matchWinners } from './selectors';
import type { Action, BoundaryPhase, Match, Random } from './types';
import { RUSH_TARGETS, rushScore, rushTarget } from './rush';

function awardPoints(
  match: Match,
  winners: string[],
  kind: 'matchResults' | 'roundResults',
): Match {
  if (match.awarded) return match;

  const scores = { ...match.scores };
  for (const id of winners) {
    scores[id] += 1;
  }

  return { ...match, scores, winners, awarded: true, phase: { kind } };
}

function readyForTurn(match: Match): Match {
  if (match.phase.kind === 'roleHandoff' && match.config.mode === 'imposter') {
    return { ...match, phase: { kind: 'private', purpose: 'deal' } };
  }

  if (match.phase.kind !== 'handoff') return match;
  if (match.config.mode === 'imposter' && match.rolesRevealed !== match.players.length) {
    return match;
  }

  const revealAgain = match.config.mode === 'imposter' && match.phase.replay;
  return {
    ...match,
    phase: revealAgain ? { kind: 'private', purpose: 'replay' } : { kind: 'ready' },
  };
}

function hideRoleCard(match: Match): Match {
  if (match.phase.kind !== 'private') return match;
  if (match.phase.purpose === 'replay') return { ...match, phase: { kind: 'ready' } };

  const rolesRevealed = match.rolesRevealed + 1;
  return {
    ...match,
    rolesRevealed,
    phase: { kind: rolesRevealed === match.players.length ? 'handoff' : 'roleHandoff' },
  };
}

function recordStayUnderTurn(match: Match, elapsedMs: number): Match {
  const totalMs = match.totalMs + elapsedMs;
  const contributions = [
    ...match.contributions,
    { playerId: currentId(match), elapsedMs, cumulativeMs: totalMs },
  ];

  if (totalMs <= match.targetMs) {
    return {
      ...match,
      contributions,
      intervals: [],
      totalMs,
      phase: { kind: 'saved', outcome: 'safe' },
    };
  }

  const playerId = currentId(match);
  const lives = { ...match.lives, [playerId]: match.lives[playerId] - 1 };
  const updated = { ...match, lives, intervals: [], totalMs: 0, contributions: [] };
  const winners = matchWinners(updated);

  const finished = match.players.length === 1 ? winners.length === 0 : winners.length === 1;
  if (finished) {
    return {
      ...updated,
      winners,
      phase: { kind: 'matchResults', bustMs: totalMs, bustContributions: contributions },
    };
  }

  return {
    ...updated,
    phase: {
      kind: 'saved',
      outcome: 'bust',
      bustMs: totalMs,
      bustContributions: contributions,
    },
  };
}

function recordRushAttempt(match: Match, elapsedMs: number): Match {
  const playerId = currentId(match);
  const attempts = [...(match.rushAttempts?.[playerId] ?? []), centiseconds(elapsedMs)];
  const finished = attempts.length === RUSH_TARGETS.length;

  return {
    ...match,
    rushAttempts: { ...match.rushAttempts, [playerId]: attempts },
    targetMs: rushTarget(attempts.length),
    scores: finished ? { ...match.scores, [playerId]: rushScore(attempts) } : match.scores,
    phase: finished ? { kind: 'saved', outcome: 'saved' } : { kind: 'paused' },
  };
}

function stopTimer(match: Match, elapsedMs: number): Match {
  if (match.phase.kind !== 'running' || !Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return match;
  }
  if (match.config.mode === 'rush') return recordRushAttempt(match, elapsedMs);

  const intervals = [...match.intervals, elapsedMs];
  if (match.config.mode === 'increments' && intervals.length < match.increments!) {
    return { ...match, intervals, phase: { kind: 'paused' } };
  }

  const totalMs = intervals.reduce((total, interval) => total + interval, 0);
  if (match.config.mode === 'under') {
    return recordStayUnderTurn(match, Math.round(totalMs));
  }

  const attempt = match.config.mode === 'imposter' ? Math.round(totalMs) : centiseconds(totalMs);
  return {
    ...match,
    intervals: [],
    attempts: { ...match.attempts, [currentId(match)]: attempt },
    phase: { kind: 'saved', outcome: 'saved' },
  };
}

function nextStayUnderTurn(match: Match, random: Random): Match {
  let turn = (match.turn + 1) % match.order.length;
  while (match.lives[match.order[turn]] === 0) {
    turn = (turn + 1) % match.order.length;
  }

  const startsNewRound = match.phase.kind === 'saved' && match.phase.outcome === 'bust';
  return {
    ...match,
    ...(startsNewRound ? assignments(match.config, match.players, random) : {}),
    round: match.round + (startsNewRound ? 1 : 0),
    turn,
    phase: { kind: 'handoff' },
  };
}

function completeClosestRound(match: Match): Match {
  const bestError = Math.min(
    ...Object.values(match.attempts).map((time) => Math.abs(time - match.targetMs)),
  );
  const winners = match.players
    .filter((player) => Math.abs(match.attempts[player.id] - match.targetMs) === bestError)
    .map((player) => player.id);

  return awardPoints(match, winners, 'roundResults');
}

function continueAfterTurn(match: Match, random: Random): Match {
  if (match.phase.kind !== 'saved') return match;
  if (match.config.mode === 'under') return nextStayUnderTurn(match, random);
  if (match.config.mode === 'rush') {
    if (match.turn < match.order.length - 1) {
      return {
        ...match,
        turn: match.turn + 1,
        targetMs: RUSH_TARGETS[0],
        phase: { kind: 'handoff' },
      };
    }
    return {
      ...match,
      awarded: true,
      winners: matchWinners(match),
      phase: { kind: 'matchResults' },
    };
  }

  if (match.turn < match.order.length - 1) {
    return { ...match, turn: match.turn + 1, phase: { kind: 'handoff' } };
  }
  if (match.config.mode === 'imposter') {
    return { ...match, phase: { kind: 'discussion' } };
  }

  return completeClosestRound(match);
}

function lockAccusation(match: Match): Match {
  if (match.phase.kind !== 'accusation') return match;

  const accusedId = match.phase.accusedId;
  const winners = accusationWinners(match, accusedId);

  return awardPoints({ ...match, accusedId }, winners, 'matchResults');
}

function startNextRound(match: Match, random: Random): Match {
  if (
    match.phase.kind !== 'roundResults' ||
    (match.config.mode !== 'closest' && match.config.mode !== 'increments')
  ) {
    return match;
  }
  if (match.round === match.config.rounds) {
    return { ...match, winners: matchWinners(match), phase: { kind: 'matchResults' } };
  }

  const order = match.players.map((player) => player.id);
  const offset = match.round % order.length;
  return {
    ...match,
    ...assignments(match.config, match.players, random),
    round: match.round + 1,
    order: [...order.slice(offset), ...order.slice(0, offset)],
    turn: 0,
    attempts: {},
    intervals: [],
    awarded: false,
    winners: [],
    accusedId: undefined,
    phase: { kind: 'handoff' },
  };
}

export function transition(match: Match, action: Action, random: Random): Match {
  const phase = match.phase.kind;

  switch (action.type) {
    case 'READY':
      return readyForTurn(match);
    case 'HIDE_CARD':
      return hideRoleCard(match);
    case 'START':
      return phase === 'ready' || phase === 'paused'
        ? { ...match, phase: { kind: 'running' } }
        : match;
    case 'STOP':
      return stopTimer(match, action.elapsed);
    case 'CONTINUE':
      return continueAfterTurn(match, random);
    case 'ACCUSE':
      return phase === 'discussion' &&
        (match.players.some((player) => player.id === action.id) ||
          (action.id === null && match.config.mode === 'imposter' && match.config.randomImposters))
        ? { ...match, phase: { kind: 'accusation', accusedId: action.id } }
        : match;
    case 'CHANGE_ACCUSATION':
      return phase === 'accusation' ? { ...match, phase: { kind: 'discussion' } } : match;
    case 'LOCK':
      return lockAccusation(match);
    case 'NEXT_ROUND':
      return startNextRound(match, random);
    case 'RESUME':
      return match.phase.kind === 'interrupted' ? { ...match, phase: match.phase.resume } : match;
  }
}

export function recover(match: Match): Match {
  if (match.phase.kind === 'matchResults' || match.phase.kind === 'interrupted') return match;

  if (match.phase.kind === 'private' && match.phase.purpose === 'deal') {
    return {
      ...match,
      phase: { kind: 'interrupted', replay: false, resume: { kind: 'roleHandoff' } },
    };
  }

  const replay = ['running', 'paused', 'ready', 'private'].includes(match.phase.kind);
  const resume: BoundaryPhase = replay
    ? { kind: 'handoff', replay: true }
    : (match.phase as BoundaryPhase);

  return { ...match, intervals: [], phase: { kind: 'interrupted', replay, resume } };
}
