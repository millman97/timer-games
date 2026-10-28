import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  MODE_INFO,
  minimumPlayers,
  maximumImposters,
  validateConfig,
  validateRoster,
} from '../../model/game';
import type { Config, Mode } from '../../model/game';
import { game, useGame } from '../../stores/game';
import {
  BottomActions,
  Confirm,
  Dialog,
  Header,
  Page,
  Panel,
  TextButton,
} from '../../components/ui';
import styles from '../../components/styles';
import type { Snapshot } from '../../utils/snapshot';
import { SetupSettings } from './SetupSettings';
import { GameRules } from '../../components/GameRules';

export default function SetupScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode: Mode =
    typeof params.mode === 'string' && Object.hasOwn(MODE_INFO, params.mode)
      ? (params.mode as Mode)
      : 'imposter';
  return <SetupForMode key={mode} mode={mode} />;
}

function initialConfig(mode: Mode, data: Snapshot): Config {
  const match = data.match;
  const config =
    mode === 'imposter' && match?.config.mode === 'imposter' && match.phase.kind === 'matchResults'
      ? match.config
      : data.settings[mode];
  return { ...config };
}

function SetupForMode({ mode }: { mode: Mode }) {
  const { data, updatePending } = useGame();
  const [draftConfig, setConfig] = useState<Config>(() => initialConfig(mode, data));
  const [replace, setReplace] = useState(false);
  const [rules, setRules] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const maxImposters = maximumImposters(data.roster.length);

  const config =
    draftConfig.mode === 'imposter'
      ? { ...draftConfig, maxImposters: Math.min(draftConfig.maxImposters, maxImposters) }
      : draftConfig;

  function startMatch() {
    const issue =
      validateRoster(data.roster, minimumPlayers(mode)) ||
      validateConfig(config, data.roster.length);
    if (issue) {
      setReplace(false);
      setError(issue);
      return;
    }
    const next = { ...game.getSnapshot().data, settings: { ...data.settings, [mode]: config } };
    if (!game.update(next)) return;
    if (game.startMatch(`match-${Date.now().toString(36)}`, config)) router.replace('/play');
  }

  function requestStart() {
    if (data.match && data.match.phase.kind !== 'matchResults') {
      setReplace(true);
    } else {
      startMatch();
    }
  }

  return (
    <>
      <Page
        header={<Header title={MODE_INFO[mode].title} onHelp={() => setRules(true)} />}
        footer={
          <BottomActions
            onBack={() => router.replace('/')}
            title={mode === 'imposter' ? 'Start game' : 'Start match'}
            disabled={updatePending}
            onPress={requestStart}
          />
        }
      >
        <Panel>
          <View style={styles.settingRow}>
            <Text style={styles.fieldLabel}>
              {data.roster.length} {data.roster.length === 1 ? 'player' : 'players'}
            </Text>
            <TextButton title='Edit players' onPress={() => router.push('/roster')} />
          </View>
        </Panel>
        <SetupSettings config={config} maxImposters={maxImposters} onChange={setConfig} />
        {!!error && (
          <Text accessibilityRole='alert' style={styles.copy}>
            {error}
          </Text>
        )}
      </Page>
      <Dialog title={MODE_INFO[mode].title} visible={rules} onClose={() => setRules(false)}>
        <GameRules mode={mode} />
      </Dialog>
      {replace && (
        <Confirm
          title='Replace the unfinished match?'
          detail='The current match and its scores will be discarded.'
          action='Replace & start'
          onCancel={() => setReplace(false)}
          onConfirm={startMatch}
        />
      )}
    </>
  );
}
