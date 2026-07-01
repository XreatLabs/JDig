/**
 * ConsoleInput — the interactive stdin field (Phase 3, step 16).
 *
 * Renders only while the run store is in `waiting-input` (the interpreter is
 * blocked on a Scanner read). On submit, resolves the pending stdin Promise
 * via `submitInput(line)` and clears the field. Hidden otherwise.
 */

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useRunStore } from '@/store/runStore';

export function ConsoleInput() {
  const state = useRunStore((s) => s.state);
  const prompt = useRunStore((s) => s.inputPrompt);
  const submitInput = useRunStore((s) => s.submitInput);
  const [value, setValue] = useState('');
  const inputRef = useRef<TextInput>(null);

  // Focus the field when a read becomes pending; clear any stale value.
  useEffect(() => {
    if (state === 'waiting-input') {
      setValue('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [state, prompt]);

  if (state !== 'waiting-input') return null;

  const onSubmit = () => {
    const line = value;
    setValue('');
    submitInput(line);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.prompt}>{prompt ? `${prompt}>` : '>'}</Text>
      <TextInput
        ref={inputRef}
        style={styles.input}
        value={value}
        onChangeText={setValue}
        onSubmitEditing={onSubmit}
        placeholder="type a value and press Enter"
        placeholderTextColor="#6e7681"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0b1021',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1f2433',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  prompt: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#7ee787',
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#e6edf3',
    paddingVertical: 4,
  },
});
