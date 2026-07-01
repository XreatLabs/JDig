/**
 * Editor screen (Phase 5, step 22) — the run-orchestration surface.
 *
 * Splits the screen into the CodeEditor (top, growable) and the Console
 * (bottom, fixed-ish height). A toolbar exposes Run / Stop / Clear and a
 * run-lifecycle badge; the project name is editable inline. Source edits are
 * debounced into the projects store (autosave); Run hands the current source
 * to runJava via the run store.
 *
 * The Console + ConsoleInput read their state from the run store directly, so
 * this screen only has to (a) feed the editor, (b) trigger runs, and (c) tear
 * the run down on unmount via `dispose()` (Scanner-abort invariant, AC4).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CodeEditor } from '@/components/editor/CodeEditor';
import { Console } from '@/components/console/Console';
import { ConsoleInput } from '@/components/console/ConsoleInput';
import { Badge, Button } from '@/components/ui/Button';
import { useProjectsStore } from '@/store/projectsStore';
import { useRunStore } from '@/store/runStore';
import { color, shadow, space, type } from '@/theme/tokens';

const AUTOSAVE_DEBOUNCE_MS = 600;
const CONSOLE_REST_HEIGHT = 220;

export default function EditorScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const project = useProjectsStore((s) => (projectId ? s.get(projectId) : null));
  const rename = useProjectsStore((s) => s.rename);
  const save = useProjectsStore((s) => s.save);

  const runState = useRunStore((s) => s.state);
  const result = useRunStore((s) => s.result);
  const run = useRunStore((s) => s.run);
  const stop = useRunStore((s) => s.stop);
  const clear = useRunStore((s) => s.clear);
  const dispose = useRunStore((s) => s.dispose);

  // Local source mirror so typing feels instant; we sync down from the store
  // when the project changes and push up (debounced) on edit.
  const [source, setSource] = useState(project?.source ?? '');
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(project?.name ?? '');
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest source + id in refs so the unmount cleanup (empty-deps effect)
  // reads current values instead of a stale first-render closure.
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  // Re-sync local state ONLY when switching projects. Gating on projectId
  // (not updatedAt) avoids clobbering in-flight typing: every debounced autosave
  // bumps updatedAt, which would otherwise retrigger this down-sync and
  // overwrite unsaved keystrokes with the last-saved value. Compare against
  // sourceRef (always fresh) instead of the closure-captured `source`.
  useEffect(() => {
    if (project && project.source !== sourceRef.current) setSource(project.source);
    if (project && project.name !== name) setName(project.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Debounced autosave of source into the projects store (AC3 persistence).
  const onSourceChange = useCallback(
    (next: string) => {
      setSource(next);
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => {
        const id = projectIdRef.current;
        if (id) save(id, next);
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [save],
  );

  // Flush pending autosave + abort any active run when leaving the editor.
  useEffect(() => {
    return () => {
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
        const id = projectIdRef.current;
        if (id) save(id, sourceRef.current);
      }
      dispose();
    };
  }, [dispose, save]);

  const onRun = useCallback(() => {
    // Save immediately so a crash/abort still persists the latest source.
    if (projectId) save(projectId, source);
    void run(source);
  }, [projectId, save, source, run]);

  const commitName = useCallback(() => {
    setEditingName(false);
    if (projectId) rename(projectId, name.trim() || project?.name || 'Untitled');
  }, [projectId, rename, name, project]);

  const isBusy = runState === 'running' || runState === 'waiting-input';
  const badge = useMemo(() => {
    const map = {
      idle: { label: 'Idle', fg: color.textMuted, bg: color.surfaceMuted },
      running: { label: 'Running', fg: color.accent, bg: color.accentSoft },
      'waiting-input': { label: 'Awaiting input', fg: color.success, bg: '#ecfdf5' },
      done: { label: 'Finished', fg: color.textSecondary, bg: color.surfaceMuted },
      error: { label: 'Error', fg: color.danger, bg: color.dangerSoft },
    } as const;
    return map[runState];
  }, [runState]);

  // No project selected — show a friendly empty state with a CTA to Projects.
  if (!project) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>No project open</Text>
        <Text style={styles.emptyHint}>
          Open one from the Projects tab, or create a new program to get started.
        </Text>
        <View style={{ height: space.lg }} />
        <Button label="Go to Projects" onPress={() => router.push('/(tabs)/projects')} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      {/* Header: editable name + run badge */}
      <View style={styles.header}>
        {editingName ? (
          <TextInput
            autoFocus
            value={name}
            onChangeText={setName}
            onBlur={commitName}
            onSubmitEditing={commitName}
            style={styles.nameInput}
            placeholder="Project name"
            placeholderTextColor={color.textFaint}
            returnKeyType="done"
          />
        ) : (
          <Pressable style={styles.nameBtn} onPress={() => { setName(project.name); setEditingName(true); }}>
            <Text style={styles.nameText} numberOfLines={1}>
              {project.name}
            </Text>
            <Text style={styles.nameChevron}>▾</Text>
          </Pressable>
        )}
        <Badge label={badge.label} fg={badge.fg} bg={badge.bg} />
      </View>

      {/* Editor (grows) */}
      <View style={styles.editorWrap}>
        <CodeEditor value={source} onChange={onSourceChange} />
      </View>

      {/* Toolbar: Run / Stop / Clear */}
      <View style={styles.toolbar}>
        {!isBusy ? (
          <Button label="Run" onPress={onRun} variant="primary" />
        ) : (
          <Button label="Stop" onPress={stop} variant="danger" />
        )}
        <Button label="Clear" onPress={clear} variant="ghost" size="sm" disabled={isBusy} />
        {result && (
          <Text style={styles.meta} numberOfLines={1}>
            {result.ok
              ? `${result.steps.toLocaleString()} steps · ${result.durationMs} ms`
              : result.reason === 'aborted'
                ? 'stopped'
                : result.reason}
          </Text>
        )}
      </View>

      {/* Console panel (fixed height; grows when input is needed). */}
      <ConsolePanel restHeight={CONSOLE_REST_HEIGHT} />
    </KeyboardAvoidingView>
  );
}

/** Console panel — animates its height when the input bar appears/disappears. */
function ConsolePanel({ restHeight }: { restHeight: number }) {
  const runState = useRunStore((s) => s.state);
  const height = runState === 'waiting-input' ? restHeight + 52 : restHeight;
  // Trigger a layout animation whenever the height changes for a smooth grow.
  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [height]);
  return (
    <View style={[styles.consoleWrap, { height }]}>
      <Console />
      <ConsoleInput />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    backgroundColor: color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  nameBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  nameText: { fontSize: type.title, fontWeight: '700', color: color.textPrimary },
  nameChevron: { fontSize: type.meta, color: color.textFaint, marginTop: 2 },
  nameInput: {
    flex: 1,
    fontSize: type.title,
    fontWeight: '600',
    color: color.textPrimary,
    paddingVertical: space.xs,
  },
  editorWrap: { flex: 1, backgroundColor: color.surface },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
    ...shadow.sm,
  },
  meta: { flex: 1, fontSize: type.micro, color: color.textFaint, textAlign: 'right' },
  consoleWrap: {
    backgroundColor: color.consoleBg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.consoleInputBorder,
    overflow: 'hidden',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xxl,
    backgroundColor: color.bg,
  },
  emptyTitle: { fontSize: type.heading, fontWeight: '700', color: color.textPrimary },
  emptyHint: {
    fontSize: type.body,
    color: color.textMuted,
    textAlign: 'center',
    marginTop: space.sm,
    lineHeight: 20,
  },
});
