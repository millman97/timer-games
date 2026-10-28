import type { StorageAdapter } from './snapshot';
// The release target is the web PWA. Native previews automatically fall back to session-only play.
const storage: StorageAdapter = {
  read: () => null,
  write: () => {
    throw new Error(
      'This native preview has no persistent adapter. Use the web app for resumable play.',
    );
  },
  clear: () => {},
};
export default storage;
