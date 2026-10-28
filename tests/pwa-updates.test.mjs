import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pwaSafety from '../src/utils/pwaSafety.web.ts';
import { GameStore } from '../src/stores/GameStore.ts';
import { DEFAULT_CONFIGS } from '../src/model/game.ts';

// All worker, storage, lifecycle, and timer APIs below are local test doubles.
class Events {
  listeners = new Map();
  addEventListener(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(fn);
  }
  removeEventListener(name, fn) {
    this.listeners.get(name)?.delete(fn);
  }
  emit(name, event = {}) {
    this.listeners.get(name)?.forEach((fn) => fn(event));
  }
  listenerCount() {
    return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0);
  }
}

async function harness(
  t,
  { waiting = true, controlled = true, busy = false, answer = true, failRegistration = false } = {},
) {
  let raw = null;
  const store = new GameStore(
    {
      read: () => raw,
      write: (value) => {
        raw = value;
      },
      clear: () => {
        raw = null;
      },
    },
    () => 0,
    () => 0.5,
  );
  store.load();
  store.update({
    ...store.getSnapshot().data,
    roster: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ],
  });
  if (busy) store.startMatch('active', DEFAULT_CONFIGS.closest);

  const messages = [];
  const timers = new Map();
  const channels = [];
  const worker = new Events();
  worker.state = 'installed';
  worker.postMessage = ({ type }, ports) => {
    messages.push(type);
    if (type === 'APPLY_UPDATE' && typeof answer === 'boolean')
      ports[0].postMessage({ accepted: answer });
    if (type === 'REPAIR_CACHE') ports[0].postMessage({ ready: true });
  };
  const registration = new Events();
  registration.waiting = waiting ? worker : null;
  registration.installing = null;
  let updates = 0;
  registration.update = async () => {
    updates++;
  };
  const workers = new Events();
  workers.controller = controlled ? worker : null;
  workers.ready = Promise.resolve(registration);
  const registrations = [];
  workers.register = async (...args) => {
    registrations.push(args);
    if (failRegistration && registrations.length === 1) throw Error('Unavailable');
    return registration;
  };
  let reloads = 0;
  let timerId = 0;
  const windowMock = Object.assign(new Events(), {
    isSecureContext: true,
    location: {
      reload: () => {
        reloads++;
      },
    },
    setTimeout: (fn) => {
      timers.set(++timerId, fn);
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
  });
  const documentMock = Object.assign(new Events(), { visibilityState: 'visible' });
  class Channel {
    constructor() {
      this.port1 = {
        closed: false,
        close() {
          this.closed = true;
        },
        onmessage: null,
      };
      this.port2 = {
        close() {},
        postMessage: (data) => {
          if (!this.port1.closed) this.port1.onmessage?.({ data });
        },
      };
      channels.push(this);
    }
  }
  const globals = {
    __DEV__: false,
    navigator: { serviceWorker: workers, onLine: true },
    window: windowMock,
    document: documentMock,
    MessageChannel: Channel,
  };
  const originals = Object.fromEntries(
    Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  for (const [name, value] of Object.entries(globals))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  const stop = pwaSafety(store);
  t.after(() => {
    stop();
    for (const name of Object.keys(globals)) {
      if (originals[name]) Object.defineProperty(globalThis, name, originals[name]);
      else delete globalThis[name];
    }
  });
  await settle();
  return {
    store,
    worker,
    workers,
    registration,
    window: windowMock,
    document: documentMock,
    registrations,
    messages,
    timers,
    channels,
    stop,
    reloads: () => reloads,
    updates: () => updates,
    expire() {
      for (const [id, fn] of [...timers]) {
        if (timers.delete(id)) fn();
      }
    },
  };
}

async function settle() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

describe('automatic updates with mocked browser APIs', () => {
  it('installs and prepares offline caching silently without reloading the first visit', async (t) => {
    const h = await harness(t, { waiting: false, controlled: false });
    assert.deepEqual(h.registrations, [['/sw.js', { scope: '/', updateViaCache: 'none' }]]);
    assert.deepEqual(h.messages, []);
    h.workers.controller = h.worker;
    h.workers.emit('controllerchange');
    assert.deepEqual(h.messages, ['REPAIR_CACHE']);
    assert.equal(h.reloads(), 0);
    assert.equal(h.store.getSnapshot().updatePending, false);
  });

  it('automatically applies an already waiting update and reloads exactly once', async (t) => {
    const h = await harness(t);
    assert.equal(h.messages.filter((type) => type === 'APPLY_UPDATE').length, 1);
    assert.equal(h.store.getSnapshot().updatePending, true);
    assert.equal(h.store.startMatch('too-soon', DEFAULT_CONFIGS.closest), false);
    h.workers.emit('controllerchange');
    h.workers.emit('controllerchange');
    assert.equal(h.reloads(), 1);
  });

  for (const boundary of ['completed', 'abandoned', 'cleared'])
    it(`defers a newly downloaded update until the saved match is ${boundary}`, async (t) => {
      const h = await harness(t, { waiting: false, busy: true });
      h.worker.state = 'installing';
      h.registration.installing = h.worker;
      h.registration.emit('updatefound');
      h.worker.state = 'installed';
      h.registration.waiting = h.worker;
      h.worker.emit('statechange');
      assert.doesNotMatch(h.messages.join(), /APPLY_UPDATE/);
      assert.equal(h.store.getSnapshot().updatePending, false);
      // An unrelated first-install/controller claim must not reload active play.
      h.workers.emit('controllerchange');
      assert.equal(h.reloads(), 0);
      const data = h.store.getSnapshot().data;
      if (boundary === 'cleared') h.store.clear();
      else
        h.store.update({
          ...data,
          match:
            boundary === 'abandoned' ? null : { ...data.match, phase: { kind: 'matchResults' } },
        });
      assert.equal(h.messages.filter((type) => type === 'APPLY_UPDATE').length, 1);
      assert.equal(h.store.getSnapshot().updatePending, true);
    });

  it('silently unlocks a rejected update and retries when the app returns to the foreground', async (t) => {
    const h = await harness(t, { answer: false });
    assert.equal(h.store.getSnapshot().updatePending, false);
    assert.equal(h.reloads(), 0);
    assert.equal(h.messages.filter((type) => type === 'APPLY_UPDATE').length, 1);
    h.document.visibilityState = 'hidden';
    h.document.emit('visibilitychange');
    assert.equal(h.updates(), 0);
    h.document.visibilityState = 'visible';
    h.document.emit('visibilitychange');
    assert.equal(h.updates(), 1);
    assert.equal(h.messages.filter((type) => type === 'APPLY_UPDATE').length, 2);
    assert.equal(h.store.getSnapshot().updatePending, false);
  });

  it('retries unavailable registration on reconnect without surfacing an error', async (t) => {
    const h = await harness(t, { failRegistration: true });
    assert.equal(h.registrations.length, 1);
    assert.equal(h.messages.length, 0);
    h.window.emit('online');
    await settle();
    assert.equal(h.registrations.length, 2);
    assert.equal(h.messages.filter((type) => type === 'APPLY_UPDATE').length, 1);
  });

  it('keeps gameplay available when an update worker stops responding', async (t) => {
    const h = await harness(t, { answer: null });
    assert.equal(h.store.getSnapshot().updatePending, true);
    h.expire();
    assert.equal(h.store.getSnapshot().updatePending, false);
    assert.equal(h.timers.size, 0);
    assert.ok(h.channels.every(({ port1 }) => port1.closed));
    assert.equal(h.store.startMatch('still-playable', DEFAULT_CONFIGS.closest), true);
    assert.equal(h.reloads(), 0);
  });

  it('participates in other tabs’ safety checks and releases their locks after a timeout or abort', async (t) => {
    const h = await harness(t, { waiting: false });
    let safe;
    const ask = () =>
      h.workers.emit('message', {
        data: { type: 'CAN_UPDATE' },
        ports: [
          {
            postMessage: (data) => {
              safe = data.safe;
            },
          },
        ],
      });
    ask();
    assert.equal(safe, true);
    assert.equal(h.store.getSnapshot().updatePending, true);
    h.expire();
    assert.equal(h.store.getSnapshot().updatePending, false);
    ask();
    h.workers.emit('message', { data: { type: 'UPDATE_ABORT' } });
    assert.equal(h.store.getSnapshot().updatePending, false);
    h.store.startMatch('busy', DEFAULT_CONFIGS.closest);
    ask();
    assert.equal(safe, false);
    assert.equal(h.store.getSnapshot().updatePending, false);
  });

  it('cleans up worker listeners, pending requests, timers, and the update lock', async (t) => {
    const h = await harness(t, { answer: null });
    h.stop();
    assert.equal(h.workers.listenerCount(), 0);
    assert.equal(h.registration.listenerCount(), 0);
    assert.equal(h.window.listenerCount(), 0);
    assert.equal(h.document.listenerCount(), 0);
    assert.equal(h.timers.size, 0);
    assert.ok(h.channels.every(({ port1 }) => port1.closed));
    assert.equal(h.store.getSnapshot().updatePending, false);
    h.store.clear();
    assert.equal(h.messages.filter((type) => type === 'APPLY_UPDATE').length, 1);
  });
});
