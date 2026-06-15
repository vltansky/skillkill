import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

export function sourceLabel(file) {
  const home = os.homedir();
  return file.startsWith(home) ? `~${file.slice(home.length)}` : file;
}

export function withinRoot(file, root) {
  const resolvedFile = path.resolve(file);
  const resolvedRoot = path.resolve(root);
  return (
    resolvedFile === resolvedRoot ||
    resolvedFile.startsWith(`${resolvedRoot}${path.sep}`)
  );
}

export function existingRoots(roots) {
  return roots.filter((root) => fs.existsSync(root));
}

export function walkFiles(root, predicate, result = []) {
  if (!fs.existsSync(root)) return result;
  const stat = fs.statSync(root);
  if (stat.isFile()) {
    if (predicate(root)) result.push(root);
    return result;
  }

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, predicate, result);
    else if (entry.isFile() && predicate(fullPath)) result.push(fullPath);
  }
  return result;
}

export function jsonStrings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => jsonStrings(item, out));
  else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => jsonStrings(item, out));
  }
  return out;
}

