export type Mode = 'imposter' | 'closest' | 'increments' | 'under' | 'rush';
export type Player = { id: string; name: string };
export type Rounds = 3 | 5 | 10;
export type TargetRange = { minTargetMs: number; maxTargetMs: number };
export type RandomTargetConfig = TargetRange &
  (
    | { mode: 'imposter'; randomImposters: boolean; maxImposters: number }
    | { mode: 'closest'; rounds: Rounds }
    | { mode: 'increments'; rounds: Rounds; maxIncrements: number }
    | { mode: 'under'; lives: number }
  );
export type Config = RandomTargetConfig | { mode: 'rush' };

export type Contribution = { playerId: string; elapsedMs: number; cumulativeMs: number };
export type BoundaryPhase =
  | { kind: 'roleHandoff' }
  | { kind: 'handoff'; replay?: boolean }
  | {
      kind: 'saved';
      outcome: 'saved' | 'safe' | 'bust';
      bustMs?: number;
      bustContributions?: Contribution[];
    }
  | { kind: 'discussion' }
  | { kind: 'accusation'; accusedId: string | null }
  | { kind: 'roundResults' }
  | { kind: 'matchResults'; bustMs?: number; bustContributions?: Contribution[] };
export type Phase =
  | BoundaryPhase
  | { kind: 'private'; purpose: 'deal' | 'replay' }
  | { kind: 'ready' | 'running' | 'paused' }
  | { kind: 'interrupted'; replay: boolean; resume: BoundaryPhase };

export type Match = {
  id: string;
  config: Config;
  players: Player[];
  round: number;
  order: string[];
  turn: number;
  rolesRevealed: number;
  targetMs: number;
  increments?: number;
  imposterIds?: string[];
  range?: [number, number];
  attempts: Record<string, number>;
  rushAttempts?: Record<string, number[]>;
  intervals: number[];
  scores: Record<string, number>;
  lives: Record<string, number>;
  totalMs: number;
  contributions: Contribution[];
  awarded: boolean;
  winners: string[];
  accusedId?: string | null;
  phase: Phase;
};

export type Random = () => number;

export type Action =
  | {
      type:
        | 'READY'
        | 'HIDE_CARD'
        | 'START'
        | 'CONTINUE'
        | 'LOCK'
        | 'CHANGE_ACCUSATION'
        | 'NEXT_ROUND'
        | 'RESUME';
    }
  | { type: 'STOP'; elapsed: number }
  | { type: 'ACCUSE'; id: string | null };
