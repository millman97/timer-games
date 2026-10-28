import { Text, View } from 'react-native';
import { Button } from './ui';
import styles from './styles';

export function NumberStepper({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Button
          title='−'
          label={`Decrease ${label}`}
          compact
          secondary
          disabled={value <= min}
          onPress={() => onChange(Math.max(min, value - step))}
        />
        <Text accessibilityLabel={`${label}: ${value}`} style={styles.value}>
          {value}
        </Text>
        <Button
          title='+'
          label={`Increase ${label}`}
          compact
          secondary
          disabled={value >= max}
          onPress={() => onChange(Math.min(max, value + step))}
        />
      </View>
    </View>
  );
}
