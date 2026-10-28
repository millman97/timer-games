import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { validateRoster } from '../../model/game';
import type { Player } from '../../model/game';
import { game, useGame } from '../../stores/game';
import { BottomActions, Button, Copy, Dialog, Header, Page } from '../../components/ui';
import styles from '../../components/styles';
import { PlayerRow } from './PlayerRow';

export default function RosterScreen() {
  const { data } = useGame();
  const [players, setPlayers] = useState<Player[]>(() =>
    data.roster.map((player) => ({ ...player })),
  );
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const index = players.findIndex((player) => player.id === selectedId);
  const selected = players[index];

  function movePlayer(direction: number) {
    if (index < 0 || index + direction < 0 || index + direction >= players.length) return;
    const next = [...players];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setPlayers(next);
    setSelectedId(null);
  }

  function renamePlayer(id: string, name: string) {
    setPlayers(players.map((player) => (player.id === id ? { ...player, name } : player)));
  }

  function addPlayer() {
    const player = {
      id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      name: '',
    };
    setPlayers([...players, player]);
  }

  function removePlayer() {
    setPlayers(players.filter((player) => player.id !== selectedId));
    setSelectedId(null);
  }

  function savePlayers() {
    const cleaned = players.map((player) => ({ ...player, name: player.name.trim() }));
    const issue = validateRoster(cleaned, 1);
    if (issue) {
      setError(issue);
      return;
    }
    if (game.update({ ...game.getSnapshot().data, roster: cleaned })) {
      router.back();
    }
  }

  return (
    <>
      <Page
        header={<Header title='Players' />}
        footer={
          <BottomActions
            backTitle='Cancel'
            onBack={() => router.back()}
            title='Save players'
            onPress={savePlayers}
          />
        }
      >
        <Copy>1–12 players · unique names</Copy>
        <View style={{ gap: 8 }}>
          {players.map((player, index) => (
            <PlayerRow
              key={player.id}
              player={player}
              index={index}
              onRename={renamePlayer}
              onOptions={setSelectedId}
            />
          ))}
        </View>
        <Button
          title='+ Add player'
          secondary
          compact
          disabled={players.length >= 12}
          onPress={addPlayer}
        />
        {!!error && (
          <Text accessibilityRole='alert' style={styles.copy}>
            {error}
          </Text>
        )}
      </Page>
      <Dialog
        title={selected?.name || 'Player options'}
        visible={!!selected}
        onClose={() => setSelectedId(null)}
      >
        <Button title='Move up' secondary disabled={index === 0} onPress={() => movePlayer(-1)} />
        <Button
          title='Move down'
          secondary
          disabled={index === players.length - 1}
          onPress={() => movePlayer(1)}
        />
        <Button title='Remove player' secondary onPress={removePlayer} />
      </Dialog>
    </>
  );
}
