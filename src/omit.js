import fs from "node:fs";
import path from "node:path";

function splitPatterns(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeRegExpChar(char) {
  return /[\\^$.*+?()[\]{}|]/.test(char) ? `\\${char}` : char;
}

function globToRegExp(pattern) {
  const source = [...pattern]
    .map((char) => {
      if (char === "*") return ".*";
      if (char === "?") return ".";
      return escapeRegExpChar(char);
    })
    .join("");
  return new RegExp(`^${source}$`);
}

function readOmitFile(file) {
  if (!file || !fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .flatMap(splitPatterns);
}

export function appendOmitPattern(options, pattern) {
  if (options.noOmitFile || !options.omitFile) {
    return { saved: false, alreadyPresent: false, file: "", pattern };
  }

  let existing = "";
  try {
    existing = fs.existsSync(options.omitFile) ? fs.readFileSync(options.omitFile, "utf8") : "";
  } catch {
    existing = "";
  }

  const alreadyPresent = existing
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .flatMap(splitPatterns)
    .some((line) => line === pattern);
  if (alreadyPresent) {
    return { saved: true, alreadyPresent: true, file: options.omitFile, pattern };
  }

  fs.mkdirSync(path.dirname(options.omitFile), { recursive: true });
  const needsLeadingNewline = existing.length > 0 && !existing.endsWith("\n");
  fs.appendFileSync(options.omitFile, `${needsLeadingNewline ? "\n" : ""}${pattern}\n`);
  return { saved: true, alreadyPresent: false, file: options.omitFile, pattern };
}

export function loadOmitPatterns(options) {
  const fromFile = options.noOmitFile
    ? []
    : readOmitFile(options.omitFile).map((pattern) => ({
        pattern,
        source: options.omitFile,
      }));
  const fromCli = (options.omitPatterns || []).flatMap(splitPatterns).map((pattern) => ({
    pattern,
    source: "--omit",
  }));

  return [...fromFile, ...fromCli].map((entry) => ({
    ...entry,
    matcher: globToRegExp(entry.pattern),
  }));
}

export function findOmitMatch(row, omitPatterns = []) {
  const values = [row.skill, row.path, row.skill_dir, row.install_root, row.link_target].filter(Boolean);
  return omitPatterns.find((entry) => values.some((value) => entry.matcher.test(value))) || null;
}
