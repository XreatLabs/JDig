/**
 * Tab layout — the app's primary navigation surface.
 *
 * Two tabs: Projects and Editor. The Editor tab reads `projectId` from the URL.
 * While the user is typing in the editor (system keyboard up), the tab bar HIDES
 * so editing is full-screen and the accessory key bar is reachable (the bar sits
 * above the keyboard). It reappears when the keyboard closes.
 */
import { useEffect, useState } from 'react';
import { Keyboard, Text } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, space, type } from '@/theme/tokens';

function TabGlyph({ glyph, active }: { glyph: string; active: boolean }) {
  return (
    <Text
      style={{
        fontSize: type.body,
        color: active ? color.accent : color.textMuted,
      }}
    >
      {glyph}
    </Text>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          display: keyboardOpen ? 'none' : 'flex',
          backgroundColor: color.surface,
          borderTopWidth: 1,
          borderTopColor: color.hairline,
          height: 54 + insets.bottom,
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
          tabBarIcon: ({ focused }) => <TabGlyph glyph="▦" active={focused} />,
        }}
      />
      <Tabs.Screen
        name="editor"
        options={{
          title: 'Editor',
          tabBarIcon: ({ focused }) => <TabGlyph glyph="‹›" active={focused} />,
        }}
      />
    </Tabs>
  );
}
