import { game } from '../stores/game';

type WorkerReply = { accepted?: boolean };

export default function pwaSafety(store = game) {
  if (__DEV__ || !('serviceWorker' in navigator) || !window.isSecureContext) return () => {};

  const workers = navigator.serviceWorker;
  const requests = new Set<() => void>();
  let registration: ServiceWorkerRegistration | undefined;
  let disposed = false;
  let registering = false;
  let applying = false;
  let repairing = false;
  let reloading = false;
  let lockTimeout: number | undefined;
  let unwatchWorker = () => {};

  function idle() {
    const { loaded, data } = store.getSnapshot();
    return loaded && (!data.match || data.match.phase.kind === 'matchResults');
  }

  function releaseLock() {
    window.clearTimeout(lockTimeout);
    lockTimeout = undefined;
    if (store.getSnapshot().updatePending) store.cancelUpdate();
  }

  function lockForUpdate() {
    if (!idle() || !store.beginUpdate()) return false;
    window.clearTimeout(lockTimeout);
    // A failed worker must never leave Start locked in any of the open tabs.
    lockTimeout = window.setTimeout(releaseLock, 8000);
    return true;
  }

  function request(worker: ServiceWorker, type: string, reply: (data?: WorkerReply) => void) {
    const channel = new MessageChannel();
    const cancel = () => {
      window.clearTimeout(timeout);
      channel.port1.close();
      channel.port2.close();
      requests.delete(cancel);
    };
    const finish = (data?: WorkerReply) => {
      cancel();
      if (!disposed) reply(data);
    };
    const timeout = window.setTimeout(() => finish(), 8000);
    requests.add(cancel);
    channel.port1.onmessage = (event) => finish(event.data);
    try {
      worker.postMessage({ type }, [channel.port2]);
    } catch {
      finish();
    }
  }

  function applyWaiting() {
    const worker = registration?.waiting;
    if (disposed || applying || !worker || !idle() || store.getSnapshot().updatePending) return;
    applying = true;
    if (!lockForUpdate()) {
      applying = false;
      return;
    }
    request(worker, 'APPLY_UPDATE', (data) => {
      applying = false;
      if (!data?.accepted) releaseLock();
    });
  }

  function repairCache() {
    const controller = workers.controller;
    if (disposed || repairing || !controller || navigator.onLine === false) return;
    repairing = true;
    request(controller, 'REPAIR_CACHE', () => {
      repairing = false;
    });
  }

  function watchInstalling() {
    unwatchWorker();
    const worker = registration?.installing;
    if (!worker) return;
    const changed = () => {
      if (worker.state === 'installed') applyWaiting();
    };
    worker.addEventListener('statechange', changed);
    unwatchWorker = () => worker.removeEventListener('statechange', changed);
    changed();
  }

  async function register() {
    if (disposed || registration || registering) return;
    registering = true;
    try {
      const result = await workers.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      if (disposed) return;
      registration = result;
      registration.addEventListener('updatefound', watchInstalling);
      watchInstalling();
      applyWaiting();
      void workers.ready
        .then(() => {
          if (!disposed) repairCache();
        })
        .catch(() => {});
    } catch {
      // Offline or unavailable browser storage should be invisible to players.
    } finally {
      registering = false;
    }
  }

  function refresh() {
    if (document.visibilityState === 'hidden') return;
    if (!registration) {
      void register();
      return;
    }
    void registration.update().catch(() => {});
    repairCache();
    applyWaiting();
  }

  const message = (event: MessageEvent) => {
    if (event.data?.type === 'CAN_UPDATE') event.ports[0]?.postMessage({ safe: lockForUpdate() });
    if (event.data?.type === 'UPDATE_ABORT') releaseLock();
  };
  const changed = () => {
    if (!reloading && store.getSnapshot().updatePending && idle()) {
      reloading = true;
      window.clearTimeout(lockTimeout);
      window.location.reload();
      return;
    }
    // First installation claims the page without interrupting it with a reload.
    repairCache();
  };
  let wasIdle = idle();
  const unsubscribe = store.subscribe(() => {
    const nowIdle = idle();
    const becameIdle = nowIdle && !wasIdle;
    wasIdle = nowIdle;
    if (becameIdle) applyWaiting();
  });
  workers.addEventListener('message', message);
  workers.addEventListener('controllerchange', changed);
  window.addEventListener('online', refresh);
  document.addEventListener('visibilitychange', refresh);
  void register();

  return () => {
    disposed = true;
    unsubscribe();
    unwatchWorker();
    registration?.removeEventListener('updatefound', watchInstalling);
    workers.removeEventListener('message', message);
    workers.removeEventListener('controllerchange', changed);
    window.removeEventListener('online', refresh);
    document.removeEventListener('visibilitychange', refresh);
    requests.forEach((cancel) => cancel());
    releaseLock();
  };
}
