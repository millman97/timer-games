import { Copy, Display, Label, Panel, Title } from '../../components/ui';
import { currentPlayer, privateCard, rolePlayer, seconds } from '../../model/game';
import type { Match, Mode, Phase } from '../../model/game';
import { BustBreakdown } from './GameResults';

export function RoleHandoff({ match }: { match: Match }) {
  return (
    <>
      <Label>
        Private roles · {match.rolesRevealed + 1} / {match.players.length}
      </Label>
      <Title>Pass to {rolePlayer(match).name}</Title>
      <Copy>Everyone else, look away.</Copy>
    </>
  );
}

export function TurnHandoff({ match, replay }: { match: Match; replay?: boolean }) {
  const solo = match.players.length === 1;
  const player = currentPlayer(match);
  return (
    <>
      <Title>{solo ? `Ready, ${player.name}?` : `Pass to ${player.name}`}</Title>
      {replay && (
        <Copy>
          {match.config.mode === 'rush'
            ? 'Continue your sequence.'
            : 'Replay your unfinished attempt.'}
        </Copy>
      )}
      {match.config.mode !== 'imposter' && (
        <Display
          value={seconds(match.targetMs)}
          caption={
            match.config.mode === 'increments'
              ? `Target · seconds · ${match.increments} intervals`
              : 'Target · seconds'
          }
        />
      )}
    </>
  );
}

export function PrivateRole({ match, purpose }: { match: Match; purpose: 'deal' | 'replay' }) {
  const player = purpose === 'deal' ? rolePlayer(match) : currentPlayer(match);
  const card = privateCard(match);

  return (
    <>
      <Label>{player.name} · PRIVATE CARD</Label>
      <Panel>
        <Title>{card.role}</Title>
        <Copy>{card.instruction}</Copy>
      </Panel>
    </>
  );
}

export function SavedTurn({
  match,
  phase,
}: {
  match: Match;
  phase: Extract<Phase, { kind: 'saved' }>;
}) {
  const player = currentPlayer(match);
  const soloRush = match.config.mode === 'rush' && match.players.length === 1;
  const titles = { safe: '✓ Safe', bust: 'Over the limit', saved: 'Attempt saved' };

  return (
    <>
      <Title>{soloRush ? 'Sequence complete' : titles[phase.outcome]}</Title>
      {phase.outcome === 'bust' ? (
        <>
          <Display
            value={(phase.bustMs! / 1000).toFixed(3)}
            caption={`Bust total · limit ${seconds(match.targetMs)} s`}
          />
          <Copy>
            {player.name} loses a life · {match.lives[player.id]} left. Total reset.
          </Copy>
          <BustBreakdown match={match} contributions={phase.bustContributions!} />
        </>
      ) : (
        <Copy>
          {soloRush
            ? 'All five targets complete.'
            : phase.outcome === 'safe'
              ? 'The shared total stays hidden.'
              : 'Results stay hidden until everyone is done.'}
        </Copy>
      )}
    </>
  );
}

export function InterruptedTurn({ replay, mode }: { replay: boolean; mode: Mode }) {
  const replayMessage =
    mode === 'rush'
      ? 'Your completed targets are kept. Continue with the current target.'
      : 'Your unfinished attempt was discarded. Completed turns are kept.';
  return (
    <>
      <Title>{replay ? 'Attempt interrupted' : 'Welcome back'}</Title>
      <Copy>{replay ? replayMessage : 'Your game is saved. Continue when everyone is ready.'}</Copy>
    </>
  );
}
