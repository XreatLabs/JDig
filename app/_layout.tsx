/**
 * Root layout (Expo Router).
 *
 * Wraps the app in <SafeAreaProvider> so every screen can read real notch/inset
 * values via useSafeAreaInsets() (without this, insets return 0 and the UI bled
 * under the status bar / gesture nav). Hydrates the projects store from disk on
 * app start (AC3). StatusBar is light because the app is pitch-black.
 */
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useProjectsStore } from '@/store/projectsStore';
import { color } from '@/theme/tokens';

export default function Layout() {
  const hydrate = useProjectsStore((s) => s.hydrate);
  useEffect(() => {
    // Kick off the on-device persistence load once. It is idempotent.
    void hydrate();
  }, [hydrate]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.bg },
        }}
      >
        <Stack.Screen name="(tabs)" />
      </Stack>
    </SafeAreaProvider>
  );
}
