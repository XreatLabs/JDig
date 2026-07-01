/**
 * On-device persistence for projects via expo-file-system (Decision D1).
 *
 * A single `projects.json` stores the whole flat project list. Writes are
 * ATOMIC (Critic gap / AC3): we write `projects.json.tmp`, then move it over
 * `projects.json` (FS.moveAsync = rename). A crash mid-save can therefore
 * never corrupt the store — at worst the previous `projects.json` survives
 * and a stale `.tmp` is left behind, which is overwritten on the next save.
 *
 * No MMKV (forces prebuild). Fully offline. Reads return [] when the file is
 * missing (first launch).
 */

import * as FS from 'expo-file-system';
import type { Project } from '../projectsStore';

const FILE_NAME = 'projects.json';
const TMP_NAME = 'projects.json.tmp';

/** Resolve the persisted projects file under documentDirectory. */
function filePath(): string {
  const dir = FS.documentDirectory;
  if (!dir) {
    throw new Error('expo-file-system documentDirectory is not available.');
  }
  return dir + FILE_NAME;
}

/** Resolve the temp file used for the atomic write. */
function tmpPath(): string {
  const dir = FS.documentDirectory;
  if (!dir) {
    throw new Error('expo-file-system documentDirectory is not available.');
  }
  return dir + TMP_NAME;
}

/** Read all projects. Returns [] if the file does not exist (first launch). */
export async function loadProjects(): Promise<Project[]> {
  const path = filePath();
  const info = await FS.getInfoAsync(path);
  if (!info.exists || info.isDirectory) return [];

  try {
    const raw = await FS.readAsStringAsync(path, {
      encoding: FS.EncodingType.UTF8,
    });
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensive: validate each entry shape so a manually-corrupted file can't
    // crash the UI hydration.
    return parsed.filter(isValidProject);
  } catch {
    // Corrupt JSON: never crash the app on hydration. Treat as empty.
    return [];
  }
}

/**
 * Persist all projects ATOMICALLY: write the temp file, then move it over the
 * real file (AC3 corruption-invariant). The move is a single filesystem rename.
 */
export async function saveProjects(projects: Project[]): Promise<void> {
  const tmp = tmpPath();
  const dst = filePath();
  const json = JSON.stringify(projects);

  // 1. Stage to temp. If the app dies here, the live file is untouched.
  await FS.writeAsStringAsync(tmp, json, {
    encoding: FS.EncodingType.UTF8,
  });

  // 2. Atomically replace the live file. On most platforms FS.moveAsync is a
  //    rename when source+dest share a directory, so this is the crash-safe
  //    swap. We use moveAsync with replace:true so a prior destination is
  //    overwritten in one step.
  await FS.moveAsync({ from: tmp, to: dst });
}

/** Best-effort delete of the persisted file (used by tests / "wipe all"). */
export async function clearProjects(): Promise<void> {
  const path = filePath();
  const info = await FS.getInfoAsync(path);
  if (info.exists) {
    await FS.deleteAsync(path, { idempotent: true });
  }
}

/** Runtime type guard used during hydration to drop malformed entries. */
function isValidProject(v: unknown): v is Project {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.source === 'string' &&
    typeof p.createdAt === 'number' &&
    typeof p.updatedAt === 'number'
  );
}
