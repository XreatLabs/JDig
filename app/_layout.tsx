/**
 * Root layout (Expo Router).
 *
 * Hydrates the projects store from disk on app start (AC3 — projects must
 * survive a full restart) and renders the (tabs) group as the sole surface.
 * Single default theme (theming deferred per spec Non-Goals).
 */
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useProjectsStore } from '@/store/projectsStore';
import { color } from '@/theme/tokens';

export default function Layout() {
  const hydrate = useProjectsStore((s) => s.hydrate);
  useEffect(() => {
    // Kick off the on-device persistence load once. It is idempotent.
    void hydrate();
  }, [hydrate]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.bg },
        }}
      >
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
