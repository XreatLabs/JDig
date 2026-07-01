/**
 * Root layout (Expo Router). Minimal for Phase 1 — the stub editor is the
 * index route. Phase 2 adds the real CodeMirror editor and tabs.
 */
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';

export default function Layout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#fafafa' },
          headerTitleStyle: { fontWeight: '600' },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'JDig' }} />
      </Stack>
    </>
  );
}

// Keep Text/View referenced for type-safety of the import in this stub phase.
export const __stub = { Text, View };
