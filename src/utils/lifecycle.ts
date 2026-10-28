import { AppState, BackHandler } from 'react-native';
export default function lifecycle(interrupt: () => void) {
  const app = AppState.addEventListener('change', (state) => {
    if (state !== 'active') interrupt();
  });
  const back = BackHandler.addEventListener('hardwareBackPress', () => {
    interrupt();
    return false;
  });
  return () => {
    app.remove();
    back.remove();
  };
}
