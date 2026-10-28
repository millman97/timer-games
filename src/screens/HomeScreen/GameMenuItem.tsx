import { Pressable, Text, View } from 'react-native';
import { MODE_INFO } from '../../model/game';
import type { Mode } from '../../model/game';
import styles from './styles';

type GameMenuItemProps = {
  mode: Mode;
  index: number;
  resume: boolean;
  compact: boolean;
  twoColumns: boolean;
  fontScale: number;
  onPress: () => void;
};

export function GameMenuItem({
  mode,
  index,
  resume,
  compact,
  twoColumns,
  fontScale,
  onPress,
}: GameMenuItemProps) {
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={`${resume ? 'Resume' : 'Play'} ${MODE_INFO[mode].title}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.item,
        compact && styles.compactItem,
        twoColumns && styles.gridItem,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.number}>
        <Text style={styles.numberDigit}>0</Text>
        <Text
          style={[
            styles.numberDigit,
            // Its zero left bearing places the narrow 1 at the cell's left edge.
            index === 0 && { transform: [{ translateX: 4.41 * fontScale }] },
          ]}
        >
          {index + 1}
        </Text>
      </View>
      <Text style={styles.gameName}>{MODE_INFO[mode].title}</Text>
      <Text style={resume ? styles.resume : styles.arrow}>{resume ? 'Resume' : '›'}</Text>
    </Pressable>
  );
}
