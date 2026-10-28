import { View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../../components/ui';
import styles from '../../components/styles';
import { currentPlayer, rolePlayer } from '../../model/game';
import type { Action, Match } from '../../model/game';
import { game } from '../../stores/game';

type SimpleAction = Exclude<Action['type'], 'STOP' | 'ACCUSE'>;

function send(type: SimpleAction) {
  game.dispatch({ type });
}

function ImposterReplayActions() {
  return (
    <View style={styles.actions}>
      <View style={styles.flex}>
        <Button
          title='Play again'
          label='Play again · same settings'
          onPress={() => game.replayImposter(`match-${Date.now().toString(36)}`)}
        />
      </View>
      <View style={styles.flex}>
        <Button
          title='Edit settings'
          secondary
          onPress={() => router.replace({ pathname: '/setup', params: { mode: 'imposter' } })}
        />
      </View>
    </View>
  );
}

export function GameActions({ match }: { match: Match }) {
  const phase = match.phase;

  switch (phase.kind) {
    case 'roleHandoff':
      return (
        <Button
          title={`I’m ${rolePlayer(match).name} · View my role`}
          onPress={() => send('READY')}
        />
      );
    case 'handoff':
      return (
        <Button title={`I’m ${currentPlayer(match).name} · Ready`} onPress={() => send('READY')} />
      );
    case 'private': {
      const finalReveal =
        phase.purpose === 'deal' && match.rolesRevealed === match.players.length - 1;
      return (
        <Button
          title={finalReveal ? 'Hide card & begin play' : 'Hide card & continue'}
          onPress={() => send('HIDE_CARD')}
        />
      );
    }
    case 'saved':
      return (
        <Button
          title={
            match.config.mode === 'rush' && match.players.length === 1 ? 'View result' : 'Continue'
          }
          onPress={() => send('CONTINUE')}
        />
      );
    case 'accusation':
      return (
        <>
          <Button title='Lock accusation' onPress={() => send('LOCK')} />
          <Button title='Change accusation' secondary onPress={() => send('CHANGE_ACCUSATION')} />
        </>
      );
    case 'roundResults': {
      const finalRound =
        (match.config.mode === 'closest' || match.config.mode === 'increments') &&
        match.round === match.config.rounds;
      return (
        <Button
          title={finalRound ? 'Final scoreboard' : 'Next round'}
          onPress={() => send('NEXT_ROUND')}
        />
      );
    }
    case 'matchResults':
      return match.config.mode === 'imposter' ? (
        <ImposterReplayActions />
      ) : (
        <Button title='Choose a game' onPress={() => router.replace('/')} />
      );
    case 'interrupted':
      return <Button title='Continue' onPress={() => send('RESUME')} />;
    default:
      return null;
  }
}
