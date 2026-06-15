import fs from "node:fs";
import path from "node:path";

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

function latestManifest(stateDir) {
  const runsDir = path.join(stateDir, "runs");
  if (!fs.existsSync(runsDir)) return "";
  const manifests = fs
    .readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => manifestPath(path.join(runsDir, entry.name)))
    .filter((file) => fs.existsSync(file))
    .sort();
  return manifests.at(-1) || "";
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
    return { count: 0, manifest: "", entries: [] };
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
    if (!fs.existsSync(row.skill_dir)) continue;
    fs.renameSync(row.skill_dir, itemDir);
    entries.push({
      skill: row.skill,
      reason: row.cleanup_reason,
      originalPath: row.skill_dir,
      quarantinedPath: itemDir,
    });
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

  return { count: entries.length, manifest: manifestPath(runDir), entries };
}

export function restoreCleanupRun(stateDir, undoTarget) {
  const file = resolveUndoManifest(stateDir, undoTarget);
  const manifest = readJson(file);
  const restored = [];
  const skipped = [];

  for (const entry of manifest.entries || []) {
    if (!fs.existsSync(entry.quarantinedPath)) {
      skipped.push({ ...entry, reason: "missing quarantined path" });
      continue;
    }
    if (fs.existsSync(entry.originalPath)) {
      skipped.push({ ...entry, reason: "original path already exists" });
      continue;
    }
    fs.mkdirSync(path.dirname(entry.originalPath), { recursive: true });
    fs.renameSync(entry.quarantinedPath, entry.originalPath);
    restored.push(entry);
  }

  manifest.restoredAt = new Date().toISOString();
  manifest.restored = restored.map((entry) => entry.skill);
  manifest.skipped = skipped.map((entry) => ({
    skill: entry.skill,
    reason: entry.reason,
  }));
  writeJson(file, manifest);

  return { manifest: file, restored, skipped };
}

