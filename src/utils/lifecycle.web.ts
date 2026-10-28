export default function lifecycle(interrupt: () => void) {
  const visibility = () => {
    if (document.visibilityState !== 'visible') interrupt();
  };
  // pagehide covers BFCache and full navigation; popstate covers browser Back.
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', interrupt);
  window.addEventListener('popstate', interrupt, true);
  window.addEventListener('blur', interrupt);
  return () => {
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('pagehide', interrupt);
    window.removeEventListener('popstate', interrupt, true);
    window.removeEventListener('blur', interrupt);
  };
}
