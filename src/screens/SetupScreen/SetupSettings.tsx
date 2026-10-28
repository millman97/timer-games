import { Text, View } from 'react-native';
import { NumberStepper } from '../../components/NumberStepper';
import styles from '../../components/styles';
import { Button, Panel } from '../../components/ui';
import type { Config, RandomTargetConfig, Rounds } from '../../model/game';

type SettingsProps = {
  config: Config;
  maxImposters: number;
  onChange: (config: Config) => void;
};

function RoundSelector({ value, onChange }: { value: Rounds; onChange: (rounds: Rounds) => void }) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.fieldLabel}>Rounds</Text>
      <View style={styles.stepper}>
        {([3, 5, 10] as const).map((rounds) => (
          <Button
            key={rounds}
            title={`${rounds}${value === rounds ? ' ✓' : ''}`}
            label={`${rounds} rounds${value === rounds ? ', selected' : ''}`}
            compact
            secondary={value !== rounds}
            onPress={() => onChange(rounds)}
          />
        ))}
      </View>
    </View>
  );
}

function ModeSettings({
  config,
  maxImposters,
  onChange,
}: {
  config: RandomTargetConfig;
  maxImposters: number;
  onChange: (config: Config) => void;
}) {
  if (config.mode === 'under') {
    return (
      <NumberStepper
        label='Lives per player'
        value={config.lives}
        min={1}
        max={5}
        onChange={(lives) => onChange({ ...config, lives })}
      />
    );
  }
  if (config.mode === 'imposter') {
    return (
      <>
        <View style={styles.settingRow}>
          <Text style={styles.fieldLabel}>Imposters</Text>
          <View style={styles.stepper}>
            <Button
              title={config.randomImposters ? 'One' : 'One ✓'}
              label={`One definite imposter${config.randomImposters ? '' : ', selected'}`}
              compact
              secondary={config.randomImposters}
              onPress={() => onChange({ ...config, randomImposters: false })}
            />
            <Button
              title={config.randomImposters ? 'Random ✓' : 'Random'}
              label={`Random imposters${config.randomImposters ? ', selected' : ''}`}
              compact
              secondary={!config.randomImposters}
              onPress={() => onChange({ ...config, randomImposters: true })}
            />
          </View>
        </View>
        {config.randomImposters && (
          <NumberStepper
            label='Max imposters'
            value={config.maxImposters}
            min={0}
            max={maxImposters}
            onChange={(maximum) => onChange({ ...config, maxImposters: maximum })}
          />
        )}
      </>
    );
  }

  return (
    <>
      <RoundSelector value={config.rounds} onChange={(rounds) => onChange({ ...config, rounds })} />
      {config.mode === 'increments' && (
        <NumberStepper
          label='Max intervals'
          value={config.maxIncrements}
          min={2}
          max={10}
          onChange={(maxIncrements) => onChange({ ...config, maxIncrements })}
        />
      )}
    </>
  );
}

export function SetupSettings({ config, maxImposters, onChange }: SettingsProps) {
  if (config.mode === 'rush') {
    return;
  }

  return (
    <Panel>
      <NumberStepper
        label='Minimum · seconds'
        value={config.minTargetMs / 1000}
        min={0}
        max={config.maxTargetMs / 1000}
        step={0.5}
        onChange={(seconds) => onChange({ ...config, minTargetMs: seconds * 1000 })}
      />
      <NumberStepper
        label='Maximum · seconds'
        value={config.maxTargetMs / 1000}
        min={config.minTargetMs / 1000}
        max={60}
        step={0.5}
        onChange={(seconds) => onChange({ ...config, maxTargetMs: seconds * 1000 })}
      />
      <ModeSettings config={config} maxImposters={maxImposters} onChange={onChange} />
    </Panel>
  );
}
