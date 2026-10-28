import { createMatch, recover, transition } from '../model/game.ts';
import type { Action, Config, Random } from '../model/game.ts';
import { decodeSnapshot, emptySnapshot } from '../utils/snapshot.ts';
import type { Snapshot, StorageAdapter } from '../utils/snapshot.ts';

export type StoreView = {
  data: Snapshot;
  loaded: boolean;
  memoryOnly: boolean;
  updatePending: boolean;
};

export class GameStore {
  private view: StoreView = {
    data: emptySnapshot(),
    loaded: false,
    memoryOnly: false,
    updatePending: false,
  };
  private listeners = new Set<() => void>();
  private startedAt: number | null = null;
  private lastStored: string | null = null;
  constructor(
    private storage: StorageAdapter,
    private clock: () => number,
    private random: Random,
  ) {}
  getSnapshot = () => this.view;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private emit() {
    this.listeners.forEach((fn) => fn());
  }
  load() {
    if (this.view.loaded) return;
    let data = this.view.data;
    let memoryOnly = this.view.memoryOnly;
    try {
      const raw = this.storage.read();
      this.lastStored = raw;
      data = raw ? decodeSnapshot(raw) : emptySnapshot();
    } catch {
      // Unavailable or unreadable storage must never block play or overwrite it.
      memoryOnly = true;
      if (data.match) data = { ...data, match: recover(data.match) };
    }
    this.view = { ...this.view, loaded: true, data, memoryOnly };
    this.emit();
  }
  private commit(data: Snapshot): boolean {
    let memoryOnly = this.view.memoryOnly;
    if (!memoryOnly) {
      try {
        if (this.storage.read() !== this.lastStored) {
          this.refreshExternal();
          // A valid newer save wins. If it cannot be loaded, continue this action
          // in memory rather than trapping the player behind a storage failure.
          if (!this.view.memoryOnly) return false;
          memoryOnly = true;
        }
        if (!memoryOnly) {
          const raw = JSON.stringify(data);
          this.storage.write(raw);
          this.lastStored = raw;
        }
      } catch {
        memoryOnly = true;
      }
    }
    // The pending edit / Start / Stop succeeds even when persistence fails.
    this.view = { ...this.view, data, memoryOnly };
    this.emit();
    return true;
  }
  update(data: Snapshot) {
    return this.commit(data);
  }
  private refreshExternal = () => {
    if (this.view.memoryOnly) return;
    this.startedAt = null;
    this.view = { ...this.view, loaded: false };
    this.load();
  };
  watchExternal = () => {
    if (this.view.memoryOnly) return () => {};
    try {
      return this.storage.subscribe?.(this.refreshExternal) ?? (() => {});
    } catch {
      this.view = { ...this.view, memoryOnly: true };
      this.emit();
      return () => {};
    }
  };
  beginUpdate = () => {
    const match = this.view.data.match;
    if (match && match.phase.kind !== 'matchResults') return false;
    this.view = { ...this.view, updatePending: true };
    this.emit();
    return true;
  };
  cancelUpdate = () => {
    this.view = { ...this.view, updatePending: false };
    this.emit();
  };
  startMatch(id: string, config: Config) {
    if (this.view.updatePending) return false;
    return this.commit({
      ...this.view.data,
      match: createMatch(id, config, this.view.data.roster, this.random),
    });
  }
  dispatch(action: Action) {
    const match = this.view.data.match;
    if (!match) return;
    const next = transition(match, action, this.random);
    if (next !== match) this.commit({ ...this.view.data, match: next });
  }
  replayImposter(id: string) {
    const match = this.view.data.match;
    if (
      this.view.updatePending ||
      match?.config.mode !== 'imposter' ||
      match.phase.kind !== 'matchResults'
    )
      return false;
    return this.commit({
      ...this.view.data,
      match: createMatch(id, match.config, match.players, this.random),
    });
  }
  activate = (at?: number) => {
    // Timestamp is captured synchronously before storage, React, or callbacks.
    const now = at ?? this.clock();
    const match = this.view.data.match;
    if (!match) return;
    if (match.phase.kind === 'ready' || match.phase.kind === 'paused') {
      const next = transition(match, { type: 'START' }, this.random);
      // Save the running marker when possible; otherwise start in this session.
      if (this.commit({ ...this.view.data, match: next })) this.startedAt = now;
    } else if (match.phase.kind === 'running' && this.startedAt !== null) {
      const elapsed = Math.max(0, now - this.startedAt);
      this.startedAt = null;
      this.dispatch({ type: 'STOP', elapsed });
    }
  };
  interrupt = () => {
    this.startedAt = null;
    const match = this.view.data.match;
    if (!match) return;
    const next = recover(match);
    if (next !== match) this.commit({ ...this.view.data, match: next });
  };
  clear = () => {
    let memoryOnly = this.view.memoryOnly;
    try {
      this.storage.clear();
      this.lastStored = null;
    } catch {
      memoryOnly = true;
    }
    this.startedAt = null;
    this.view = { ...this.view, data: emptySnapshot(), memoryOnly };
    this.emit();
  };
}
