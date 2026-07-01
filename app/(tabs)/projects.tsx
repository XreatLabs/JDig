/**
 * Projects list screen (Phase 4, step 20).
 *
 * Cards (name + updatedAt), a "New" action, open (navigate to the editor with
 * the project id), and delete-with-confirm. Hydrates the projects store from
 * disk on mount.
 *
 * Routing/ownership note: this worker owns only the screen file. The tab bar
 * and editor route are wired by task #7 (Phase 5). Navigation to the editor is
 * written against the planned route (`/editor?projectId=…`); until Phase 5
 * registers that route it is a safe no-op-ish push that Expo Router will resolve
 * once the route exists.
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
import { useProjectsStore, type Project } from '@/store/projectsStore';
import { TEMPLATES } from '@/data/templates';

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

  const [refreshing, setRefreshing] = useState(false);

  // Hydrate from disk once on mount (app-start persistence load, AC3).
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
      // Routing target is wired in Phase 5 (task #7). Passing the id as a param
      // is the agreed hand-off; the editor screen reads `projectId`.
      router.push({ pathname: '/editor', params: { projectId: p.id } });
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
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => remove(p.id),
          },
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
        style={styles.card}
        onPress={() => openProject(item)}
        onLongPress={() => confirmDelete(item)}
        accessibilityRole="button"
        accessibilityLabel={`Open project ${item.name}`}
      >
        <View style={styles.cardMain}>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {item.source.split('\n')[0].trim() || 'Empty project'}
          </Text>
        </View>
        <View style={styles.cardSide}>
          <Text style={styles.cardTime}>{relativeTime(item.updatedAt)}</Text>
          <Pressable
            hitSlop={12}
            onPress={() => confirmDelete(item)}
            accessibilityRole="button"
            accessibilityLabel={`Delete project ${item.name}`}
          >
            <Text style={styles.delete}>Delete</Text>
          </Pressable>
        </View>
      </Pressable>
    ),
    [openProject, confirmDelete],
  );

  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        <Pressable style={[styles.btn, styles.primary]} onPress={newBlank}>
          <Text style={styles.btnText}>+ New</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.secondary]} onPress={newFromTemplate}>
          <Text style={styles.btnTextDark}>Template</Text>
        </Pressable>
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={
          projects.length === 0 ? styles.listEmpty : styles.listContent
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },
  actions: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  primary: { backgroundColor: '#2563eb' },
  secondary: { backgroundColor: '#eef2ff' },
  btnText: { color: '#fff', fontWeight: '600' },
  btnTextDark: { color: '#2563eb', fontWeight: '600' },
  list: { flex: 1 },
  listContent: { paddingVertical: 8 },
  listEmpty: { flex: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cardMain: { flex: 1, marginRight: 12 },
  cardName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  cardMeta: {
    fontSize: 12,
    color: '#6b7280',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  cardSide: { alignItems: 'flex-end' },
  cardTime: { fontSize: 11, color: '#9ca3af', marginBottom: 4 },
  delete: { fontSize: 12, color: '#dc2626', fontWeight: '600' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: '#f0f0f0', marginLeft: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#374151' },
  emptyHint: { fontSize: 13, color: '#9ca3af', marginTop: 6, textAlign: 'center' },
});
