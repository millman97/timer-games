import { Text, View } from 'react-native';
import { Copy, Display, Label, Panel, Title } from '../../components/ui';
import styles from '../../components/styles';
import { currentPlayer, isImposter, playerNames, resultTime, seconds } from '../../model/game';
import type { Contribution, Match, Phase, Player } from '../../model/game';

function Scoreboard({ match }: { match: Match }) {
  const stayUnder = match.config.mode === 'under';
  const standings = [...match.players].sort((first, second) =>
    stayUnder
      ? match.lives[second.id] - match.lives[first.id]
      : match.scores[second.id] - match.scores[first.id],
  );

  return (
    <Panel>
      <Label>{stayUnder ? 'Remaining lives' : 'Final scores'}</Label>
      {standings.map((player) => (
        <View key={player.id} style={styles.statRow}>
          <Text style={styles.statName}>
            {match.winners.includes(player.id) ? '★ ' : ''}
            {player.name}
          </Text>
          <Text style={styles.statValue}>
            {stayUnder
              ? `${match.lives[player.id]} lives`
              : `${match.scores[player.id]} ${match.scores[player.id] === 1 ? 'point' : 'points'}`}
          </Text>
        </View>
      ))}
    </Panel>
  );
}

function attemptError(match: Match, playerId: string): number {
  return Math.abs(match.attempts[playerId] - match.targetMs);
}

function AttemptResultRow({ match, player }: { match: Match; player: Player }) {
  const error = (attemptError(match, player.id) / 1000).toFixed(2);
  const score = match.scores[player.id];

  return (
    <View style={styles.resultRow}>
      <View style={styles.statRow}>
        <Text style={styles.statName}>
          {player.name}
          {isImposter(match, player.id) ? ' · Imposter' : ''}
        </Text>
        <Text style={styles.statValue}>{resultTime(match.attempts[player.id])} s</Text>
      </View>
      <Text style={styles.statDetail}>
        Error {error} s · {score} {score === 1 ? 'point' : 'points'}
        {match.winners.includes(player.id) ? ' (+1)' : ''}
      </Text>
    </View>
  );
}

function AttemptResults({ match }: { match: Match }) {
  const orderedPlayers = [...match.players].sort(
    (first, second) => attemptError(match, first.id) - attemptError(match, second.id),
  );

  return (
    <Panel>
      <Label>
        Target · {seconds(match.targetMs)} s
        {match.config.mode === 'increments' ? ` · ${match.increments} intervals` : ''}
      </Label>
      {orderedPlayers.map((player) => (
        <AttemptResultRow key={player.id} match={match} player={player} />
      ))}
    </Panel>
  );
}

export function BustBreakdown({
  match,
  contributions,
}: {
  match: Match;
  contributions: Contribution[];
}) {
  return (
    <Panel>
      <View style={styles.statRow}>
        <Text style={[styles.small, styles.flex]}>Player</Text>
        <Text style={[styles.small, styles.statColumn]}>Added · s</Text>
        <Text style={[styles.small, styles.statColumn]}>Total · s</Text>
      </View>
      <View>
        {contributions.map((entry, index) => {
          const name = playerNames(match, [entry.playerId]);
          const added = (entry.elapsedMs / 1000).toFixed(3);
          const total = (entry.cumulativeMs / 1000).toFixed(3);
          return (
            <View
              key={index}
              accessible
              accessibilityLabel={`${index + 1}. ${name}. Added +${added} s · cumulative ${total} s`}
              style={[styles.statRow, styles.tableRow]}
            >
              <Text style={styles.statName}>
                {index + 1}. {name}
              </Text>
              <Text style={[styles.statValue, styles.statColumn]}>+{added}</Text>
              <Text style={[styles.statValue, styles.statColumn]}>{total}</Text>
            </View>
          );
        })}
      </View>
    </Panel>
  );
}

export function RoundResults({ match }: { match: Match }) {
  return (
    <>
      <Title>
        {playerNames(match, match.winners)} {match.winners.length > 1 ? 'tie' : 'wins'}
      </Title>
      <AttemptResults match={match} />
    </>
  );
}

export function ImposterResults({ match }: { match: Match }) {
  const crewWon = match.winners.some((id) => !isImposter(match, id));
  const imposterWon = match.winners.some((id) => isImposter(match, id));
  const multipleImposters = match.imposterIds!.length > 1;
  return (
    <>
      <Title>
        {crewWon
          ? 'Crewmates win'
          : imposterWon
            ? multipleImposters
              ? 'Imposters win'
              : 'Imposter wins'
            : 'No winners'}
      </Title>
      <Copy>
        Accused:{' '}
        {match.accusedId === null ? 'No imposters' : playerNames(match, [match.accusedId!])} ·{' '}
        {match.imposterIds!.length === 1 ? 'Imposter' : 'Imposters'}:{' '}
        {playerNames(match, match.imposterIds!) || 'None'}
        {match.imposterIds!.length > 0
          ? `\nImposter range: ${seconds(match.range![0])}–${seconds(match.range![1])} s`
          : ''}
        {crewWon && imposterWon ? '\nUncaught imposters also win.' : ''}
      </Copy>
      <AttemptResults match={match} />
    </>
  );
}

export function MatchResults({
  match,
  phase,
}: {
  match: Match;
  phase: Extract<Phase, { kind: 'matchResults' }>;
}) {
  const player = currentPlayer(match);

  return (
    <>
      <Title>
        {match.players.length === 1
          ? 'Game over'
          : `${playerNames(match, match.winners)} ${match.winners.length > 1 ? 'share the win' : 'wins'}`}
      </Title>
      {phase.bustMs !== undefined && (
        <>
          <Display
            value={(phase.bustMs / 1000).toFixed(3)}
            caption={`Final bust · limit ${seconds(match.targetMs)} s`}
          />
          <Copy>{player.name} lost their last life.</Copy>
          <BustBreakdown match={match} contributions={phase.bustContributions!} />
        </>
      )}
      <Scoreboard match={match} />
    </>
  );
}
