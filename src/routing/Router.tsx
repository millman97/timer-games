import { Stack } from 'expo-router';

const Router = () => {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'none',
        gestureEnabled: false,
        contentStyle: { backgroundColor: '#080B08' },
      }}
    >
      <Stack.Screen name='index' options={{ title: 'Timer Games' }} />
      <Stack.Screen name='setup' options={{ title: 'Setup · Timer Games' }} />
      <Stack.Screen name='roster' options={{ title: 'Players · Timer Games' }} />
      <Stack.Screen name='play' options={{ title: 'Play · Timer Games' }} />
    </Stack>
  );
};

export default Router;
