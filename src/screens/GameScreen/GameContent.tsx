import { View } from 'react-native';
import { Button, Copy, Title } from '../../components/ui';
import styles from '../../components/styles';
import { playerNames } from '../../model/game';
import type { Match } from '../../model/game';
import { game } from '../../stores/game';
import { ImposterResults, MatchResults, RoundResults } from './GameResults';
import { InterruptedTurn, PrivateRole, RoleHandoff, SavedTurn, TurnHandoff } from './TurnContent';
import { TimerTurn } from './TimerTurn';
import { RushResults } from './RushResults';

function AccusationChoices({ match }: { match: Match }) {
  return (
    <>
      <Title>Who is the imposter?</Title>
      <Copy>Discuss, then choose one player together.</Copy>
      <View style={[styles.row, { alignItems: 'stretch' }]}>
        {match.players.map((player) => (
          <View key={player.id} style={{ width: '48%' }}>
            <Button
              title={player.name}
              label={`Accuse ${player.name}`}
              secondary
              onPress={() => game.dispatch({ type: 'ACCUSE', id: player.id })}
            />
          </View>
        ))}
      </View>
      {match.config.mode === 'imposter' && match.config.randomImposters && (
        <Button
          title='No imposters'
          secondary
          onPress={() => game.dispatch({ type: 'ACCUSE', id: null })}
        />
      )}
    </>
  );
}

export function GameContent({ match }: { match: Match }) {
  const phase = match.phase;

  switch (phase.kind) {
    case 'roleHandoff':
      return <RoleHandoff match={match} />;
    case 'handoff':
      return <TurnHandoff match={match} replay={phase.replay} />;
    case 'private':
      return <PrivateRole match={match} purpose={phase.purpose} />;
    case 'ready':
    case 'running':
    case 'paused':
      return <TimerTurn match={match} />;
    case 'saved':
      return <SavedTurn match={match} phase={phase} />;
    case 'discussion':
      return <AccusationChoices match={match} />;
    case 'accusation':
      return (
        <>
          <Title>
            {phase.accusedId === null
              ? 'No imposters?'
              : `Accuse ${playerNames(match, [phase.accusedId])}?`}
          </Title>
          <Copy>Lock your choice to reveal all roles and times.</Copy>
        </>
      );
    case 'roundResults':
      return <RoundResults match={match} />;
    case 'matchResults':
      if (match.config.mode === 'rush') return <RushResults match={match} />;
      return match.config.mode === 'imposter' ? (
        <ImposterResults match={match} />
      ) : (
        <MatchResults match={match} phase={phase} />
      );
    case 'interrupted':
      return <InterruptedTurn replay={phase.replay} mode={match.config.mode} />;
  }
}
