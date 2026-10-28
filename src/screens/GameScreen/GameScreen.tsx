import { useState } from 'react';
import { router } from 'expo-router';
import { Button, Copy, Header, Page, Title } from '../../components/ui';
import { MODE_INFO } from '../../model/game';
import type { Match } from '../../model/game';
import { game, useGame } from '../../stores/game';
import { GameActions } from './GameActions';
import { GameContent } from './GameContent';
import { GameDialogs } from './GameDialogs';
import type { GameOverlay } from './GameDialogs';

function gameTitle(match: Match): string {
  const title = MODE_INFO[match.config.mode].title;
  if (match.config.mode === 'closest' || match.config.mode === 'increments') {
    return `${title} · ${match.round}/${match.config.rounds}`;
  }
  return title;
}

function isContentCentered(match: Match): boolean {
  switch (match.phase.kind) {
    case 'discussion':
    case 'roundResults':
    case 'matchResults':
      return false;
    case 'saved':
      return match.phase.outcome !== 'bust';
    default:
      return true;
  }
}

export default function GameScreen() {
  const { data, loaded } = useGame();
  const [overlay, setOverlay] = useState<GameOverlay>(null);
  const match = data.match;

  function openOverlay(next: 'menu' | 'rules') {
    if (game.getSnapshot().data.match?.phase.kind !== 'running') {
      setOverlay(next);
    }
  }

  function abandonMatch() {
    if (game.update({ ...data, match: null })) {
      router.replace('/');
    }
  }

  if (!loaded) {
    return (
      <Page centered>
        <Copy>Loading…</Copy>
      </Page>
    );
  }
  if (!match) {
    return (
      <Page centered footer={<Button title='Choose a game' onPress={() => router.replace('/')} />}>
        <Title>No active game</Title>
      </Page>
    );
  }

  const running = match.phase.kind === 'running';
  const finished = match.phase.kind === 'matchResults';
  const hasFooter = !['ready', 'running', 'paused', 'discussion'].includes(match.phase.kind);

  return (
    <>
      <Page
        centered={isContentCentered(match)}
        header={
          <Header
            title={gameTitle(match)}
            backLabel={finished ? 'Home' : 'Menu'}
            disabled={running}
            onBack={() => (finished ? router.replace('/') : openOverlay('menu'))}
            onHelp={() => openOverlay('rules')}
          />
        }
        footer={hasFooter ? <GameActions match={match} /> : undefined}
      >
        <GameContent match={match} />
      </Page>
      <GameDialogs match={match} overlay={overlay} onChange={setOverlay} onAbandon={abandonMatch} />
    </>
  );
}
