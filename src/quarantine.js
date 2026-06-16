import fs from "node:fs";
import path from "node:path";
import { removeSkillsFromVercelLocks, restoreVercelLockEntries } from "./vercel-lock.js";

function safeRunId(now) {
  return now.toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function uniqueRunDir(stateDir, now) {
  const base = safeRunId(now);
  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? "" : `-${index}`;
    const runDir = path.join(stateDir, "runs", `${base}${suffix}`);
    if (!fs.existsSync(runDir)) return runDir;
  }
  throw new Error("Could not allocate a unique cleanup run directory");
}

function manifestPath(runDir) {
  return path.join(runDir, "manifest.json");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function pathExistsOrSymlink(file) {
  try {
    fs.lstatSync(file);
    return true;
  } catch {
    return false;
  }
}

function cleanupEntry(row, extra = {}) {
  return {
    skill: row.skill,
    reason: row.cleanup_reason,
    originalPath: row.skill_dir,
    descriptionTokenCost: row.description_token_cost,
    recentStrongCount: row.recent_strong_count,
    recentWeakCount: row.recent_weak_count,
    ...extra,
  };
}

export function listCleanupRuns(stateDir) {
  const runsDir = path.join(stateDir, "runs");
  if (!fs.existsSync(runsDir)) return [];

  return fs
    .readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => manifestPath(path.join(runsDir, entry.name)))
    .filter((file) => fs.existsSync(file))
    .map((file) => {
      try {
        const manifest = readJson(file);
        const id = manifest.id || path.basename(path.dirname(file));
        const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
        return {
          id,
          manifest: file,
          createdAt: manifest.createdAt || "",
          entries,
          restoredAt: manifest.restoredAt || "",
          restored: Array.isArray(manifest.restored) ? manifest.restored : [],
          skipped: Array.isArray(manifest.skipped) ? manifest.skipped : [],
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) =>
      `${right.createdAt || right.id}`.localeCompare(`${left.createdAt || left.id}`),
    );
}

function latestManifest(stateDir) {
  return listCleanupRuns(stateDir)[0]?.manifest || "";
}

export function resolveUndoManifest(stateDir, undoTarget) {
  if (!undoTarget || undoTarget === "latest") {
    const latest = latestManifest(stateDir);
    if (!latest) throw new Error(`No cleanup runs found in ${path.join(stateDir, "runs")}`);
    return latest;
  }
  if (undoTarget.includes("/") || undoTarget.endsWith(".json")) {
    return path.resolve(undoTarget);
  }
  return manifestPath(path.join(stateDir, "runs", undoTarget));
}

export function quarantineCandidates(rows, options) {
  const candidates = rows.filter((row) => row.cleanup_candidate);
  if (candidates.length === 0) {
    return { mode: "quarantine", count: 0, manifest: "", entries: [] };
  }

  const runDir = uniqueRunDir(options.stateDir, options.now);
  const itemsDir = path.join(runDir, "items");
  const entries = [];

  fs.mkdirSync(itemsDir, { recursive: true });
  for (const [index, row] of candidates.entries()) {
    const itemDir = path.join(
      itemsDir,
      `${String(index + 1).padStart(4, "0")}-${row.skill.replaceAll("/", "_")}`,
    );
    if (!pathExistsOrSymlink(row.skill_dir)) continue;
    fs.renameSync(row.skill_dir, itemDir);
    entries.push(
      cleanupEntry(row, {
        quarantinedPath: itemDir,
      }),
    );
  }

  const vercelLocks = removeSkillsFromVercelLocks(
    entries.map((entry) => entry.skill),
    options,
  );
  for (const entry of entries) {
    const locks = vercelLocks.entriesBySkill.get(entry.skill);
    if (locks?.length) entry.vercelLockEntries = locks;
  }

  const manifest = {
    version: 1,
    id: path.basename(runDir),
    createdAt: options.now.toISOString(),
    stateDir: options.stateDir,
    entries,
  };
  writeJson(manifestPath(runDir), manifest);
  writeJson(path.join(options.stateDir, "latest.json"), {
    manifest: manifestPath(runDir),
  });

  return {
    mode: "quarantine",
    count: entries.length,
    manifest: manifestPath(runDir),
    entries,
    vercelLocks: {
      removed: vercelLocks.removed,
      errors: vercelLocks.errors,
    },
  };
}

export function deleteCandidates(rows, options) {
  const candidates = rows.filter((row) => row.cleanup_candidate);
  if (candidates.length === 0) {
    return { mode: "delete", count: 0, manifest: "", entries: [] };
  }

  const entries = [];
  for (const row of candidates) {
    if (!pathExistsOrSymlink(row.skill_dir)) continue;
    fs.rmSync(row.skill_dir, { recursive: true, force: false });
    entries.push(cleanupEntry(row, { deletedPath: row.skill_dir }));
  }

  const vercelLocks = removeSkillsFromVercelLocks(
    entries.map((entry) => entry.skill),
    options,
  );

  return {
    mode: "delete",
    count: entries.length,
    manifest: "",
    entries,
    vercelLocks: {
      removed: vercelLocks.removed,
      errors: vercelLocks.errors,
    },
  };
}

export function restoreCleanupRun(stateDir, undoTarget) {
  const file = resolveUndoManifest(stateDir, undoTarget);
  const manifest = readJson(file);
  const restored = [];
  const skipped = [];

  for (const entry of manifest.entries || []) {
    if (!pathExistsOrSymlink(entry.quarantinedPath)) {
      skipped.push({ ...entry, reason: "missing quarantined path" });
      continue;
    }
    if (pathExistsOrSymlink(entry.originalPath)) {
      skipped.push({ ...entry, reason: "original path already exists" });
      continue;
    }
    fs.mkdirSync(path.dirname(entry.originalPath), { recursive: true });
    fs.renameSync(entry.quarantinedPath, entry.originalPath);
    restored.push(entry);
  }

  const vercelLockEntries = restored.flatMap((entry) => entry.vercelLockEntries || []);
  const vercelLocks = restoreVercelLockEntries(vercelLockEntries);

  manifest.restoredAt = new Date().toISOString();
  manifest.restored = restored.map((entry) => entry.skill);
  manifest.skipped = skipped.map((entry) => ({
    skill: entry.skill,
    reason: entry.reason,
  }));
  writeJson(file, manifest);

  return { manifest: file, restored, skipped, vercelLocks };
}
