import { router } from 'expo-router';
import { Button, Confirm, Dialog } from '../../components/ui';
import { GameRules } from '../../components/GameRules';
import type { Match } from '../../model/game';
import { game } from '../../stores/game';

export type GameOverlay = 'menu' | 'rules' | 'leave' | 'abandon' | null;

type GameDialogsProps = {
  match: Match;
  overlay: GameOverlay;
  onChange: (overlay: GameOverlay) => void;
  onAbandon: () => void;
};

export function GameDialogs({ match, overlay, onChange, onAbandon }: GameDialogsProps) {
  if (match.phase.kind === 'running') return null;

  function confirmExit() {
    if (overlay === 'leave') {
      game.interrupt();
      router.replace('/');
    } else {
      onAbandon();
    }
  }

  return (
    <>
      <Dialog title='Game menu' visible={overlay === 'menu'} onClose={() => onChange(null)}>
        <Button title='Save & leave' secondary onPress={() => onChange('leave')} />
        <Button title='Abandon match' secondary onPress={() => onChange('abandon')} />
      </Dialog>
      <Dialog title='Rules' visible={overlay === 'rules'} onClose={() => onChange(null)}>
        <GameRules mode={match.config.mode} />
      </Dialog>
      {(overlay === 'leave' || overlay === 'abandon') && (
        <Confirm
          title={overlay === 'leave' ? 'Save and leave?' : 'Abandon this match?'}
          detail={
            overlay === 'leave'
              ? 'Completed turns are kept. Any unfinished attempt must be replayed.'
              : 'The match and scores will be discarded. Players and settings are kept.'
          }
          action={overlay === 'leave' ? 'Save & leave' : 'Abandon'}
          onCancel={() => onChange(null)}
          onConfirm={confirmExit}
        />
      )}
    </>
  );
}
