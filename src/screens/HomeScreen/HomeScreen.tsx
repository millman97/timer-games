import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { Confirm, Page, TextButton } from '../../components/ui';
import type { Mode } from '../../model/game';
import { MODE_INFO } from '../../model/game';
import { game, useGame } from '../../stores/game';
import { homeLayout } from '../../utils/layout';
import styles from './styles';
import { GameMenuItem } from './GameMenuItem';

export default function HomeScreen() {
  const { data } = useGame();
  const { width, height, fontScale } = useWindowDimensions();
  const { columns, compact } = homeLayout(width, height);
  const [reset, setReset] = useState(false);
  const active = data.match?.phase.kind !== 'matchResults' ? data.match : null;

  function openGame(mode: Mode) {
    if (active?.config.mode === mode) {
      game.interrupt();
      router.replace('/play');
    } else {
      router.push({ pathname: '/setup', params: { mode } });
    }
  }

  function clearData() {
    game.clear();
    setReset(false);
  }

  return (
    <>
      <Page scroll='never'>
        <View style={[styles.layout, compact && styles.compactLayout]}>
          <Text
            accessibilityRole='header'
            style={[styles.wordmark, compact && styles.compactWordmark]}
          >
            TIMER{columns === 1 ? '\n' : ' '}
            <Text style={styles.green}>GAMES</Text>
          </Text>
          <View
            style={[styles.menu, compact && styles.compactMenu, columns === 2 && styles.menuGrid]}
          >
            {(Object.keys(MODE_INFO) as Mode[]).map((mode, index) => (
              <GameMenuItem
                key={mode}
                mode={mode}
                index={index}
                resume={active?.config.mode === mode}
                compact={compact}
                twoColumns={columns === 2}
                fontScale={fontScale}
                onPress={() => openGame(mode)}
              />
            ))}
          </View>
          <View style={styles.footer}>
            <TextButton title='Clear data' onPress={() => setReset(true)} />
          </View>
        </View>
      </Page>
      {reset && (
        <Confirm
          title='Clear saved data?'
          detail='Delete players, settings and the saved game?'
          action='Clear data'
          onCancel={() => setReset(false)}
          onConfirm={clearData}
        />
      )}
    </>
  );
}
