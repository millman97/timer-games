import { Text, View, useWindowDimensions } from 'react-native';
import TimerControl from '../../components/TimerControl';
import { Display } from '../../components/ui';
import styles from '../../components/styles';
import { currentId, currentPlayer, RUSH_TARGETS, seconds } from '../../model/game';
import type { Match } from '../../model/game';
import { game } from '../../stores/game';

function timerStatus(match: Match): string {
  const status =
    match.phase.kind === 'running' ? 'Running' : match.phase.kind === 'paused' ? 'Paused' : 'Ready';

  if (match.config.mode === 'increments') {
    return `${status} · Interval ${match.intervals.length + 1} / ${match.increments}`;
  }
  if (match.config.mode === 'under') {
    return `${status} · ${match.lives[currentPlayer(match).id]} lives`;
  }
  if (match.config.mode === 'rush') {
    const completed = match.rushAttempts?.[currentId(match)]?.length ?? 0;
    return `${status} · Target ${completed + 1} / ${RUSH_TARGETS.length}`;
  }
  return status;
}

export function TimerTurn({ match }: { match: Match }) {
  const { width, height } = useWindowDimensions();
  const landscape = width > height && height < 500;
  const timerSize = landscape ? 156 : height < 640 ? 176 : 216;
  const running = match.phase.kind === 'running';
  const hidden = match.config.mode === 'imposter';
  const buttonLabel = running ? 'Stop' : match.phase.kind === 'paused' ? 'Start next' : 'Start';

  return (
    <View style={[styles.timerLayout, landscape && styles.timerLandscape]}>
      <View style={styles.timerInfo}>
        <Text accessibilityRole='header' style={[styles.title, styles.centerText]}>
          {currentPlayer(match).name}
        </Text>
        <Display
          value={hidden ? '--.--' : seconds(match.targetMs)}
          caption={hidden ? 'Time stays hidden' : 'Target · seconds'}
        />
        <Text accessibilityLiveRegion='polite' style={styles.timingStatus}>
          {timerStatus(match)}
        </Text>
      </View>
      <View style={styles.timerSurface}>
        <TimerControl size={timerSize} label={buttonLabel} onActivate={game.activate} />
      </View>
    </View>
  );
}
