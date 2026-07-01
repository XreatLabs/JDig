/**
 * Projects store (Phase 4): the in-memory state for the multi-project system.
 *
 * A flat list of single-file Java projects. State mutations go through zustand
 * actions; persistence is decoupled — every mutating action debounces a write
 * through the fileSystemPersist layer (atomic temp-file + rename, AC3).
 *
 * Ownership note: this worker owns projectsStore.ts + persist/. Other workers
 * own runStore.ts, editor, console, and layouts.
 */

import { create } from 'zustand';
import { loadProjects, saveProjects } from './persist/fileSystemPersist';

/** A single persisted project (one .java file). */
export interface Project {
  /** Stable unique id (also used as the editor route param). */
  id: string;
  /** Human-friendly display name. */
  name: string;
  /** Java source text. */
  source: string;
  /** Creation epoch ms. */
  createdAt: number;
  /** Last-save epoch ms (drives "updated" display + ordering). */
  updatedAt: number;
}

/** Default source for a brand-new empty project. */
const NEW_PROJECT_SOURCE = `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, JDig!");
    }
}
`;

/** Bare name used for a freshly-created untitled project. */
const UNTITLED = 'Untitled';

/** Generate a reasonably-unique id without extra deps. */
function newId(): string {
  return (
    Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
  );
}

export interface ProjectsState {
  /** All projects, newest-updated first (drives the list screen order). */
  projects: Project[];
  /** The currently-selected project id (null = none selected). */
  selectedId: string | null;
  /** True once hydrate() has completed on app start. */
  hydrated: boolean;

  // --- lifecycle ---
  /** Load persisted projects from disk into memory (call on app start). */
  hydrate: () => Promise<void>;

  // --- queries ---
  /** All projects. */
  list: () => Project[];
  /** The selected project, or null. */
  selected: () => Project | null;
  /** A project by id, or null. */
  get: (id: string) => Project | null;

  // --- mutations ---
  /** Create a new project (optionally pre-seeded with source/name) and select it. */
  create: (opts?: { name?: string; source?: string }) => Project;
  /** Rename a project. */
  rename: (id: string, name: string) => void;
  /** Save (overwrite) a project's source; bumps updatedAt. */
  save: (id: string, source: string) => void;
  /** Delete a project by id; clears selection if it was selected. */
  remove: (id: string) => void;
  /** Set the selected project id. */
  select: (id: string | null) => void;
}

/**
 * Persist the current projects array to disk. Centralised so every mutation
 * stays write-consistent. Failures are surfaced to the caller via the action's
 * own try/catch (a persistence failure must NOT crash the UI thread).
 */
async function persist(projects: Project[]): Promise<void> {
  try {
    await saveProjects(projects);
  } catch (e) {
    // Non-fatal: keep the in-memory state intact so the user can keep editing.
    // A dedicated error surface (toast) can be added later; for now we log.
    // eslint-disable-next-line no-console
    console.warn('[projectsStore] persistence write failed:', e);
  }
}

/** Sort newest-updated-first so the list shows recent work on top. */
function byUpdatedDesc(a: Project, b: Project): number {
  return b.updatedAt - a.updatedAt;
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  selectedId: null,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const loaded = await loadProjects();
    loaded.sort(byUpdatedDesc);
    set({
      projects: loaded,
      selectedId: loaded.length ? loaded[0].id : null,
      hydrated: true,
    });
  },

  list: () => get().projects,
  selected: () => {
    const { projects, selectedId } = get();
    return selectedId ? projects.find((p) => p.id === selectedId) ?? null : null;
  },
  get: (id) => get().projects.find((p) => p.id === id) ?? null,

  create: (opts) => {
    const now = Date.now();
    const project: Project = {
      id: newId(),
      name: (opts?.name ?? '').trim() || UNTITLED,
      source: opts?.source ?? NEW_PROJECT_SOURCE,
      createdAt: now,
      updatedAt: now,
    };
    const projects = [project, ...get().projects].sort(byUpdatedDesc);
    set({ projects, selectedId: project.id });
    void persist(projects);
    return project;
  },

  rename: (id, name) => {
    const trimmed = name.trim();
    const projects = get().projects.map((p) =>
      p.id === id
        ? { ...p, name: trimmed || p.name, updatedAt: Date.now() }
        : p,
    ).sort(byUpdatedDesc);
    set({ projects });
    void persist(projects);
  },

  save: (id, source) => {
    const projects = get().projects.map((p) =>
      p.id === id ? { ...p, source, updatedAt: Date.now() } : p,
    ).sort(byUpdatedDesc);
    set({ projects });
    void persist(projects);
  },

  remove: (id) => {
    const projects = get().projects.filter((p) => p.id !== id);
    const { selectedId } = get();
    set({
      projects,
      selectedId: selectedId === id ? null : selectedId,
    });
    void persist(projects);
  },

  select: (id) => set({ selectedId: id }),
}));
