import { Text, TextInput, View } from 'react-native';
import { TextButton } from '../../components/ui';
import styles, { colors } from '../../components/styles';
import type { Player } from '../../model/game';

type PlayerRowProps = {
  player: Player;
  index: number;
  onRename: (id: string, name: string) => void;
  onOptions: (id: string) => void;
};

export function PlayerRow({ player, index, onRename, onOptions }: PlayerRowProps) {
  return (
    <View style={[styles.row, { flexWrap: 'nowrap', gap: 8 }]}>
      <Text style={[styles.small, { width: 20, textAlign: 'center' }]}>{index + 1}</Text>
      <TextInput
        accessibilityLabel={`Player ${index + 1} name`}
        style={[styles.input, styles.flex, { minHeight: 44, padding: 10 }]}
        placeholder='Name'
        placeholderTextColor={colors.muted}
        value={player.name}
        maxLength={24}
        autoCorrect={false}
        onChangeText={(name) => onRename(player.id, name)}
      />
      <TextButton
        title='⋯'
        label={`Options for ${player.name || `player ${index + 1}`}`}
        onPress={() => onOptions(player.id)}
      />
    </View>
  );
}
