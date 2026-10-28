import { Text, View } from 'react-native';
import { Label, Panel, Title } from '../../components/ui';
import styles from '../../components/styles';
import { playerNames, resultTime, rushBreakdown } from '../../model/game';
import type { Match, Player, RushAttemptResult } from '../../model/game';

function RushAttemptRow({ playerName, result }: { playerName: string; result: RushAttemptResult }) {
  const target = resultTime(result.targetMs);
  const time = resultTime(result.elapsedMs);
  const error = resultTime(result.errorMs);
  const total = resultTime(result.totalErrorMs);

  return (
    <View
      accessible
      accessibilityLabel={`${playerName}. Target ${target} s. Time ${time} s. Error ${error} s. Total error ${total} s.`}
      style={[styles.statRow, styles.tableRow]}
    >
      <Text style={[styles.statValue, styles.rushTarget]}>{target}</Text>
      <Text style={[styles.statValue, styles.rushValue]}>{time}</Text>
      <Text style={[styles.statValue, styles.rushValue]}>{error}</Text>
      <Text style={[styles.statValue, styles.rushValue]}>{total}</Text>
    </View>
  );
}

function PlayerBreakdown({ match, player }: { match: Match; player: Player }) {
  const breakdown = rushBreakdown(match.rushAttempts![player.id]);
  return (
    <Panel>
      <View style={styles.statRow}>
        <Text style={styles.statName}>{player.name}</Text>
        <Text style={styles.accent}>{resultTime(match.scores[player.id])} s</Text>
      </View>
      <View style={styles.statRow}>
        <Text style={[styles.small, styles.rushTarget]}>Target</Text>
        <Text style={[styles.small, styles.rushValue]}>Time</Text>
        <Text style={[styles.small, styles.rushValue]}>Error</Text>
        <Text style={[styles.small, styles.rushValue]}>Total</Text>
      </View>
      <View>
        {breakdown.map((result) => (
          <RushAttemptRow key={result.targetMs} playerName={player.name} result={result} />
        ))}
      </View>
    </Panel>
  );
}

export function RushResults({ match }: { match: Match }) {
  const solo = match.players.length === 1;
  const standings = [...match.players].sort(
    (first, second) => match.scores[first.id] - match.scores[second.id],
  );

  return (
    <>
      <Title>
        {solo
          ? 'Your result'
          : `${playerNames(match, match.winners)} ${match.winners.length > 1 ? 'tie' : 'wins'}`}
      </Title>
      <Label>{solo ? 'Total error · seconds' : 'Total error · seconds · lowest wins'}</Label>
      {standings.map((player) => (
        <PlayerBreakdown key={player.id} match={match} player={player} />
      ))}
    </>
  );
}
