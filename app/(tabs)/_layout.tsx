/**
 * Tab layout — the app's primary navigation surface.
 *
 * Two tabs: Projects (list/CRUD) and Editor (the run-orchestration split).
 * The Editor tab reads `projectId` from the URL query; the tab index route
 * redirects to Projects so the app always lands on the list.
 *
 * Tab bar uses the design tokens (single default theme; theming deferred).
 */
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, space, type } from '@/theme/tokens';

function TabIcon({ label, active }: { label: string; active: boolean }) {
  return (
    <Text style={{ fontSize: type.body, fontWeight: active ? '700' : '500', color: active ? color.accent : color.textMuted }}>
      {label}
    </Text>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: color.surface,
          borderTopWidth: 1,
          borderTopColor: color.hairline,
          height: 52 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingHorizontal: space.lg,
        },
        tabBarActiveTintColor: color.accent,
        tabBarInactiveTintColor: color.textMuted,
        tabBarLabelStyle: { fontSize: type.micro, fontWeight: '600' },
        tabBarAllowFontScaling: false,
      }}
    >
      <Tabs.Screen
        name="projects"
        options={{
          title: 'Projects',
          tabBarIcon: ({ focused }) => <TabIcon label="▦" active={focused} />,
        }}
      />
      <Tabs.Screen
        name="editor"
        options={{
          title: 'Editor',
          tabBarIcon: ({ focused }) => <TabIcon label="‹›" active={focused} />,
        }}
      />
    </Tabs>
  );
}
