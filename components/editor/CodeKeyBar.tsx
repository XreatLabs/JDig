/**
 * CodeKeyBar — an accessory code-key row pinned above the system keyboard.
 *
 * Phone keyboards lack characters you need constantly while writing Java
 * (Tab, braces, brackets, semicolons, arrow). This is a horizontally
 * scrollable strip of tappable keys that each call `onKey(text)`, which the
 * editor screen wires to `CodeEditor.insert()` so the text lands at the
 * cursor.
 *
 * Style follows the pitch-black tokens: muted surface strip, individual key
 * chips with a hairline border, monospace glyphs. ~44pt tall for ergonomics.
 */
import React, { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { color, radius, space, type } from '@/theme/tokens';

/** The keys, in display order. Tab inserts 4 spaces (matches indentUnit). */
const KEYS: { label: string; insert: string; wide?: boolean }[] = [
  { label: 'Tab', insert: '    ', wide: true },
  { label: '{', insert: '{' },
  { label: '}', insert: '}' },
  { label: '(', insert: '(' },
  { label: ')', insert: ')' },
  { label: '[', insert: '[' },
  { label: ']', insert: ']' },
  { label: ';', insert: ';' },
  { label: '"', insert: '"' },
  { label: "'", insert: "'" },
  { label: '=', insert: '=' },
  { label: '+', insert: '+' },
  { label: '-', insert: '-' },
  { label: '*', insert: '*' },
  { label: '/', insert: '/' },
  { label: '<', insert: '<' },
  { label: '>', insert: '>' },
  { label: '!', insert: '!' },
  { label: '&', insert: '&' },
  { label: '|', insert: '|' },
  { label: '->', insert: '->' },
];

export interface CodeKeyBarProps {
  /** Called with the text the tapped key should insert at the cursor. */
  onKey: (text: string) => void;
}

export const CodeKeyBar = React.memo(function CodeKeyBar({
  onKey,
}: CodeKeyBarProps) {
  const renderItem = useCallback(
    (k: { label: string; insert: string; wide?: boolean }) => (
      <Pressable
        key={k.label}
        onPress={() => onKey(k.insert)}
        accessibilityRole="button"
        accessibilityLabel={`Insert ${k.label}`}
        style={({ pressed }) => [styles.key, k.wide && styles.keyWide, pressed && styles.keyPressed]}
      >
        <Text style={styles.keyText}>{k.label}</Text>
      </Pressable>
    ),
    [onKey],
  );

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="always"
      >
        {KEYS.map(renderItem)}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    height: 44,
    backgroundColor: color.surfaceMuted,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: space.xs,
    gap: space.xs,
  },
  key: {
    minWidth: 40,
    height: 32,
    marginVertical: 6,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
  },
  keyWide: {
    minWidth: 56,
  },
  keyPressed: {
    backgroundColor: color.accentSoft,
    borderColor: color.accent,
  },
  keyText: {
    fontFamily: 'monospace',
    fontSize: type.body,
    fontWeight: '600',
    color: color.textPrimary,
  },
});

export default CodeKeyBar;
