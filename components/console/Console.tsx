/**
 * Console — the program output view (Phase 3, step 15).
 *
 * A FlatList of stdout/stderr lines from the run store, autoscrolling to the
 * newest line while the user is pinned to the bottom. Stderr is styled
 * distinctly from stdout so runtime/abort errors stand out. The scrollback
 * buffer is capped in the store (SCROLLBACK_CAP).
 */

import React, { useEffect, useRef } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useRunStore, type OutputLine } from '@/store/runStore';
import { color } from '@/theme/tokens';

const keyExtractor = (item: OutputLine) => String(item.id);

export function Console() {
  const lines = useRunStore((s) => s.lines);
  const state = useRunStore((s) => s.state);
  const listRef = useRef<FlatList<OutputLine>>(null);
  const pinnedToBottom = useRef(true);

  // Autoscroll when new lines arrive, but only if the user hasn't scrolled up.
  useEffect(() => {
    if (pinnedToBottom.current && lines.length > 0) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: false });
      });
    }
  }, [lines.length]);

  const onScroll = (e: { nativeEvent: { layoutMeasurement: { height: number }; contentOffset: { y: number }; contentSize: { height: number } } }) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const distanceFromBottom =
      contentSize.height - contentOffset.y - layoutMeasurement.height;
    pinnedToBottom.current = distanceFromBottom < 40;
  };

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={lines}
        keyExtractor={keyExtractor}
        renderItem={({ item }) => (
          <Text style={item.stream === 'stderr' ? styles.stderr : styles.stdout}>
            {item.text}
          </Text>
        )}
        onScroll={onScroll}
        scrollEventThrottle={32}
        contentContainerStyle={styles.content}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {state === 'idle' ? 'Output will appear here.' : ''}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.consoleBg,
  },
  content: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  stdout: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#e8e8ec',
    lineHeight: 18,
  },
  stderr: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#f87171',
    lineHeight: 18,
  },
  empty: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#8e8e93',
    fontStyle: 'italic',
  },
});
