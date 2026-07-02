/**
 * Editor screen — the run-orchestration surface.
 *
 * The CodeEditor now owns the full screen (more room for code). The console
 * is HIDDEN by default and opened as a modal dialog when a run starts: the
 * primary Run control is a floating action button (FAB) bottom-right, and a
 * run-state-driven Modal hosts the Console + ConsoleInput + Stop. An accessory
 * CodeKeyBar sits just above the system keyboard so the phone can type
 * characters it lacks (Tab, braces, brackets, ...).
 *
 * The Console + ConsoleInput read their state from the run store directly, so
 * this screen only has to (a) feed the editor, (b) trigger runs, and (c) tear
 * the run down on unmount via `dispose()` (Scanner-abort invariant, AC4).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CodeEditor,
  type CodeEditorHandle,
} from '@/components/editor/CodeEditor';
import { CodeKeyBar } from '@/components/editor/CodeKeyBar';
import { Console } from '@/components/console/Console';
import { ConsoleInput } from '@/components/console/ConsoleInput';
import { Badge, Button } from '@/components/ui/Button';
import { useProjectsStore } from '@/store/projectsStore';
import { useRunStore } from '@/store/runStore';
import { color, font, shadow, space, type, radius } from '@/theme/tokens';

const AUTOSAVE_DEBOUNCE_MS = 600;

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

  // Imperative handle to the CodeMirror editor (for the accessory key bar).
  const editorRef = useRef<CodeEditorHandle>(null);

  // Local source mirror so typing feels instant; we sync down from the store
  // when the project changes and push up (debounced) on edit.
  const [source, setSource] = useState(project?.source ?? '');
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(project?.name ?? '');
  // Run dialog visibility. Auto-opens when a run becomes active; also opens
  // when the FAB is tapped. Closing just hides the dialog (the run continues
  // unless Stop is pressed).
  const [isRunOpen, setIsRunOpen] = useState(false);
  // Tracks unsaved edits so the header can show a "saving…/saved" status.
  const [dirty, setDirty] = useState(false);
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
      setDirty(true);
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => {
        const id = projectIdRef.current;
        if (id) save(id, next);
        setDirty(false);
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
    setIsRunOpen(true);
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
      'waiting-input': { label: 'Awaiting input', fg: color.success, bg: 'rgba(52,211,153,0.16)' },
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
        <Text style={[styles.saveStatus, dirty && styles.saveStatusBusy]}>
          {dirty ? 'saving…' : 'saved'}
        </Text>
        <Badge label={badge.label} fg={badge.fg} bg={badge.bg} />
      </View>

      {/* Editor fills the screen (console is now a modal). */}
      <View style={styles.editorWrap}>
        <CodeEditor ref={editorRef} value={source} onChange={onSourceChange} />
      </View>

      {/* Accessory code-key bar: pinned just above the tab bar / system
          keyboard so the extra keys are reachable while typing. */}
      <CodeKeyBar onKey={(t) => editorRef.current?.insert(t)} />

      {/* Floating Run FAB (bottom-right). The primary run control. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isBusy ? 'Stop program' : 'Run program'}
        onPress={isBusy ? stop : onRun}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
      >
        <Text style={styles.fabGlyph}>{isBusy ? '■' : '▶'}</Text>
        <Text style={styles.fabLabel}>{isBusy ? 'Stop' : 'Run'}</Text>
      </Pressable>

      {/* Run dialog: opens when a run starts (or the FAB is tapped). */}
      <Modal
        visible={isRunOpen}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setIsRunOpen(false)}
      >
        <View style={[styles.modalOuter, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Output</Text>
            <Badge label={badge.label} fg={badge.fg} bg={badge.bg} />
            <View style={{ flex: 1 }} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close output"
              onPress={() => setIsRunOpen(false)}
              style={styles.closeBtn}
              hitSlop={10}
            >
              <Text style={styles.closeGlyph}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.modalBody}>
            <Console />
          </View>

          <ConsoleInput />

          <View style={[styles.modalFooter, { paddingBottom: insets.bottom + space.sm }]}>
            <View style={{ flex: 1 }}>
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
            {isBusy ? (
              <Button label="Stop" onPress={stop} variant="danger" />
            ) : (
              <Button label="Run again" onPress={onRun} variant="primary" />
            )}
            <Button label="Clear" onPress={clear} variant="ghost" size="sm" disabled={isBusy} />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
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
  // Floating Run FAB. Pinned bottom-right above the tab bar.
  fab: {
    position: 'absolute',
    right: space.lg,
    bottom: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.lg,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    ...shadow.glow,
  },
  fabPressed: { backgroundColor: color.accentHover, opacity: 0.92 },
  fabGlyph: { fontSize: type.body, fontWeight: '800', color: '#11111b' },
  fabLabel: { fontSize: type.body, fontWeight: '700', color: '#11111b' },
  saveStatus: {
    fontSize: type.micro,
    fontFamily: font.mono,
    color: color.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginRight: space.sm,
  },
  saveStatusBusy: { color: color.accent },
  // Run dialog.
  modalOuter: { flex: 1, backgroundColor: color.bg },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    backgroundColor: color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  modalTitle: { fontSize: type.title, fontWeight: '700', color: color.textPrimary },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surfaceMuted,
  },
  closeGlyph: { fontSize: type.body, fontWeight: '700', color: color.textSecondary },
  modalBody: {
    flex: 1,
    backgroundColor: color.consoleBg,
    overflow: 'hidden',
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
  },
  meta: { fontSize: type.micro, color: color.textFaint },
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
