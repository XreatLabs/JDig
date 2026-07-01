/**
 * Projects list screen (Phase 4 step 20 + Phase 5 visual pass).
 *
 * Cards (name + updatedAt + first-line preview), a "New" action, open
 * (navigate to the Editor tab with the project id), and delete-with-confirm.
 * Hydrates the projects store from disk on mount (AC3).
 *
 * Visual layer (Phase 5): restyled against the design tokens — consistent
 * spacing scale, clear hierarchy (name > preview > time), generous separation
 * between the action bar and the list, and 44pt-min touch targets. Logic is
 * unchanged from the Phase 4 implementation.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProjectsStore, type Project } from '@/store/projectsStore';
import { TEMPLATES } from '@/data/templates';
import { Button } from '@/components/ui/Button';
import { color, space, type } from '@/theme/tokens';

/** Relative-time formatter ("just now" / "5m" / "3h" / "2d" / date). */
function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function ProjectsScreen() {
  const projects = useProjectsStore((s) => s.projects);
  const hydrated = useProjectsStore((s) => s.hydrated);
  const hydrate = useProjectsStore((s) => s.hydrate);
  const create = useProjectsStore((s) => s.create);
  const remove = useProjectsStore((s) => s.remove);
  const select = useProjectsStore((s) => s.select);
  const insets = useSafeAreaInsets();

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await hydrate();
    } finally {
      setRefreshing(false);
    }
  }, [hydrate]);

  const openProject = useCallback(
    (p: Project) => {
      select(p.id);
      router.push({ pathname: '/(tabs)/editor', params: { projectId: p.id } });
    },
    [select],
  );

  const confirmDelete = useCallback(
    (p: Project) => {
      Alert.alert(
        'Delete project',
        `Delete "${p.name}"? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => remove(p.id) },
        ],
        { cancelable: true },
      );
    },
    [remove],
  );

  const newBlank = useCallback(() => {
    const p = create();
    openProject(p);
  }, [create, openProject]);

  const newFromTemplate = useCallback(() => {
    Alert.alert(
      'New from template',
      'Choose a starter program',
      [
        { text: 'Cancel', style: 'cancel' },
        ...TEMPLATES.slice(0, 8).map((t) => ({
          text: t.name,
          onPress: () => {
            const p = create({ name: t.name, source: t.source });
            openProject(p);
          },
        })),
      ],
      { cancelable: true },
    );
  }, [create, openProject]);

  const renderItem = useCallback(
    ({ item }: { item: Project }) => (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => openProject(item)}
        onLongPress={() => confirmDelete(item)}
        accessibilityRole="button"
        accessibilityLabel={`Open project ${item.name}`}
      >
        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.cardPreview} numberOfLines={1}>
            {item.source.split('\n')[0].trim() || 'Empty project'}
          </Text>
          <Text style={styles.cardTime}>{relativeTime(item.updatedAt)}</Text>
        </View>
        <Pressable
          hitSlop={12}
          onPress={() => confirmDelete(item)}
          accessibilityRole="button"
          accessibilityLabel={`Delete project ${item.name}`}
          style={styles.deleteBtn}
        >
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      </Pressable>
    ),
    [openProject, confirmDelete],
  );

  return (
    <View style={styles.container}>
      {/* Header (tab layout hides the native header) */}
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Text style={styles.title}>Projects</Text>
        <Text style={styles.subtitle}>
          {hydrated ? `${projects.length} saved` : 'Loading…'}
        </Text>
      </View>

      {/* Action bar */}
      <View style={styles.actions}>
        <Button label="+ New" onPress={newBlank} variant="primary" />
        <Button label="Template" onPress={newFromTemplate} variant="secondary" />
      </View>

      <FlatList
        style={styles.list}
        data={projects}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {hydrated ? 'No projects yet' : 'Loading…'}
            </Text>
            <Text style={styles.emptyHint}>
              {hydrated
                ? 'Tap “New” to start a blank program, or “Template” for a sample.'
                : 'Reading saved projects from device storage.'}
            </Text>
          </View>
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={projects.length === 0 ? styles.listEmpty : styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.bg },
  header: {
    backgroundColor: color.surface,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  title: { fontSize: type.heading, fontWeight: '700', color: color.textPrimary },
  subtitle: { fontSize: type.meta, color: color.textFaint, marginTop: 2 },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.lg,
    backgroundColor: color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  list: { flex: 1 },
  listContent: { paddingVertical: space.md },
  listEmpty: { flex: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.surface,
    paddingHorizontal: space.lg,
    paddingVertical: space.md + 2,
    gap: space.md,
  },
  cardPressed: { backgroundColor: color.surfaceMuted },
  cardBody: { flex: 1 },
  cardName: { fontSize: type.body + 1, fontWeight: '600', color: color.textPrimary },
  cardPreview: {
    fontSize: type.meta,
    color: color.textMuted,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  cardTime: { fontSize: type.micro, color: color.textFaint, marginTop: 4 },
  deleteBtn: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    minHeight: 36,
    justifyContent: 'center',
  },
  deleteText: { fontSize: type.meta, color: color.danger, fontWeight: '600' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline, marginLeft: space.lg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  emptyTitle: { fontSize: type.title, fontWeight: '700', color: color.textSecondary },
  emptyHint: { fontSize: type.body, color: color.textFaint, marginTop: space.sm, textAlign: 'center', lineHeight: 20 },
});

