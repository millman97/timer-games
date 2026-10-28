import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Router from './routing/Router';
import { game, useGame } from './stores/game';
import lifecycle from './utils/lifecycle';
import pwaSafety from './utils/pwaSafety';
import { prepareTimerBeep } from './utils/timerBeep';

const App = () => {
  const path = usePathname();
  const { loaded } = useGame();
  const [font, error] = useFonts({ TimerDigits: require('../assets/fonts/TimerDigits.ttf') });
  useEffect(() => {
    game.load();
    const releaseBeep = prepareTimerBeep();
    const unwatch = game.watchExternal();
    const unbind = lifecycle(game.interrupt);
    const unbindUpdates = pwaSafety();
    return () => {
      unwatch();
      unbind();
      unbindUpdates();
      releaseBeep();
    };
  }, []);
  useEffect(() => {
    if (path !== '/play') game.interrupt();
  }, [path]);
  if ((!font && !error) || !loaded) return null;
  return (
    <SafeAreaProvider>
      <StatusBar style='light' />
      <Router />
    </SafeAreaProvider>
  );
};

export default App;
