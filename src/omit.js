import fs from "node:fs";

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
  const values = [row.skill, row.path, row.skill_dir].filter(Boolean);
  return omitPatterns.find((entry) => values.some((value) => entry.matcher.test(value))) || null;
}
