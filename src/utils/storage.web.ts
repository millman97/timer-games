import { STORAGE_KEY } from './snapshot';
import type { StorageAdapter } from './snapshot';
const storage: StorageAdapter = {
  read: () => window.localStorage.getItem(STORAGE_KEY),
  write: (value) => window.localStorage.setItem(STORAGE_KEY, value),
  clear: () => window.localStorage.removeItem(STORAGE_KEY),
  subscribe: (listener) => {
    const changed = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) listener();
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  },
};
export default storage;
