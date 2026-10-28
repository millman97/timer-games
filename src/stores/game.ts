import { useSyncExternalStore } from 'react';
import { GameStore } from './GameStore';
import storage from '../utils/storage';

export const game = new GameStore(storage, () => performance.now(), Math.random);
export const useGame = () =>
  useSyncExternalStore(game.subscribe, game.getSnapshot, game.getSnapshot);
