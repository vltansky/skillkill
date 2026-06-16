import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawnSync } from "node:child_process";
import { existingRoots, jsonStrings, sourceLabel, walkFiles, withinRoot } from "./fs-utils.js";
import { timestampFromRecord } from "./model.js";

const SKILL_BLOCK_RE =
  /<skill>\s*<name>([^<]+)<\/name>\s*<path>([^<]+)<\/path>[\s\S]*?<\/skill>/g;
const AGENTS_SKILL_PATH_RE =
  /(?<path>(?:~|\/[^"'<>\s]+)?\/\.agents\/skills\/(?<name>[^\/"'<>\s]+)\/SKILL\.md)/g;
const CLAUDE_SKILL_PATH_RE =
  /(?:~|\/[^"'<>\s]+)?\/\.claude\/skills\/(?<name>[^\/"'<>\s]+)\/SKILL\.md/g;
const READ_TOOL_NAMES = new Set([
  "cat",
  "open",
  "openfile",
  "read",
  "readfile",
  "view",
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dynamicSkillPathRe(skillsDir) {
  if (skillsDir.includes(`${path.sep}.agents${path.sep}skills`)) return null;
  return new RegExp(
    `(?<path>${escapeRegExp(skillsDir)}\\/(?<name>[^\\/"'<>\\s]+)\\/SKILL\\.md)`,
    "g",
  );
}

function dynamicSkillPathPattern(skillsDir) {
  if (skillsDir.includes(`${path.sep}.agents${path.sep}skills`)) return "";
  return `${escapeRegExp(skillsDir)}\\/[^\\/"'<>\\s]+\\/SKILL\\.md`;
}

function skillPathSearchPattern(skillsDir) {
  return [
    String.raw`(?:~|/[^"'<>\s]+)?/\.agents/skills/[^/"'<>\s]+/SKILL\.md`,
    String.raw`(?:~|/[^"'<>\s]+)?/\.claude/skills/[^/"'<>\s]+/SKILL\.md`,
    dynamicSkillPathPattern(skillsDir),
  ]
    .filter(Boolean)
    .join("|");
}

function sourcePointer(file, lineNo) {
  return lineNo ? `${sourceLabel(file)}:${lineNo}` : sourceLabel(file);
}

function fileTimestamp(file) {
  try {
    return fs.statSync(file).mtime;
  } catch {
    return null;
  }
}

function unquoteFrontmatterValue(value) {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === `"` && last === `"`) || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return {};

  const metadata = {};
  const lines = match[1].split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!field) continue;

    const [, key, rawValue] = field;
    if (/^[>|]/.test(rawValue.trim())) {
      const block = [];
      for (index += 1; index < lines.length; index += 1) {
        if (!/^\s+/.test(lines[index])) {
          index -= 1;
          break;
        }
        block.push(lines[index].trim());
      }
      metadata[key] = rawValue.trim().startsWith("|") ? block.join("\n") : block.join(" ");
      continue;
    }

    metadata[key] = unquoteFrontmatterValue(rawValue);
  }
  return metadata;
}

function readSkillMetadata(file) {
  try {
    return parseFrontmatter(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function addStrategy(stats, strategy) {
  if (stats.strategy === "not-run") {
    stats.strategy = strategy;
    return;
  }
  if (!stats.strategy.split("+").includes(strategy)) {
    stats.strategy = `${stats.strategy}+${strategy}`;
  }
}

function attributionSkills(value, out = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => attributionSkills(item, out));
    return out;
  }
  if (!value || typeof value !== "object") return out;

  for (const [key, item] of Object.entries(value)) {
    if (key === "attributionSkill" && typeof item === "string") {
      out.push(item);
      continue;
    }
    attributionSkills(item, out);
  }
  return out;
}

function normalizedToolName(value) {
  return typeof value === "string" ? value.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
}

function structuredToolName(record) {
  return (
    record.tool ??
    record.name ??
    record.toolName ??
    record.function?.name ??
    record.toolCall?.name ??
    record.toolCall?.toolName ??
    record.toolCall?.function?.name
  );
}

function maybeJson(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function structuredToolInput(record) {
  return [
    record.input,
    record.args,
    record.arguments,
    record.params,
    record.state?.input,
    record.function?.arguments,
    record.toolCall?.input,
    record.toolCall?.args,
    record.toolCall?.arguments,
    record.toolCall?.function?.arguments,
  ].map(maybeJson);
}

export function listSkillFiles(skillsDir) {
  if (!fs.existsSync(skillsDir)) return [];
  return fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => ({
      name: entry.name,
      file: path.join(skillsDir, entry.name, "SKILL.md"),
    }))
    .filter((entry) => fs.existsSync(entry.file));
}

export function collectSkills(skillsDir) {
  const skills = new Map();
  for (const entry of listSkillFiles(skillsDir)) {
    const stat = fs.statSync(entry.file);
    const metadata = readSkillMetadata(entry.file);
    skills.set(entry.name, {
      skill: entry.name,
      path: entry.file,
      description: typeof metadata.description === "string" ? metadata.description : "",
      atime: stat.atime,
      birthtime: stat.birthtime,
      mtime: stat.mtime,
      strong: [],
      weak: [],
    });
  }
  return skills;
}

function addEvidence(skills, name, evidence, strong) {
  const usage = skills.get(name);
  if (!usage) return false;
  (strong ? usage.strong : usage.weak).push(evidence);
  return true;
}

function addPathEvidence(skills, skillsDir, pathText, fallbackName, evidence, strong) {
  const file = pathText.startsWith("~/")
    ? path.join(process.env.HOME || "", pathText.slice(2))
    : pathText;
  if (!withinRoot(file, skillsDir)) return false;
  const name = path.basename(path.dirname(file)) || fallbackName;
  return addEvidence(skills, name, evidence, strong);
}

function addSkillPathReferences(skills, options, text, context) {
  const customPathRe = dynamicSkillPathRe(options.skillsDir);
  const strong = Boolean(context.strong);
  let count = 0;

  for (const match of text.matchAll(CLAUDE_SKILL_PATH_RE)) {
    const name = context.aliases?.get(match.groups.name) || match.groups.name;
    if (
      addEvidence(
        skills,
        name,
        {
          ts: context.ts,
          kind: context.kind,
          source: context.source,
        },
        strong,
      )
    ) {
      count += 1;
    }
  }

  for (const match of text.matchAll(AGENTS_SKILL_PATH_RE)) {
    if (
      addPathEvidence(
        skills,
        options.skillsDir,
        match.groups.path,
        match.groups.name,
        {
          ts: context.ts,
          kind: context.kind,
          source: context.source,
        },
        strong,
      )
    ) {
      count += 1;
    }
  }

  if (customPathRe) {
    for (const match of text.matchAll(customPathRe)) {
      if (
        addPathEvidence(
          skills,
          options.skillsDir,
          match.groups.path,
          match.groups.name,
          {
            ts: context.ts,
            kind: context.kind,
            source: context.source,
          },
          strong,
        )
      ) {
        count += 1;
      }
    }
  }

  if (context.stats) context.stats.evidence += count;
  return count;
}

function addStructuredToolReadEvidence(skills, options, record, context) {
  const toolName = normalizedToolName(structuredToolName(record));
  if (!READ_TOOL_NAMES.has(toolName)) return 0;

  return addSkillPathReferences(
    skills,
    options,
    jsonStrings(structuredToolInput(record)).join("\n"),
    {
      ...context,
      strong: true,
    },
  );
}

function rgMatchingCoordinates(roots, pattern) {
  if (roots.length === 0) return null;
  const result = spawnSync(
    "rg",
    [
      "-n",
      "-o",
      "--no-heading",
      "--color",
      "never",
      "--no-messages",
      "--glob",
      "*.jsonl",
      "-e",
      pattern,
      ...roots,
    ],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );

  if (result.error) return null;
  if (![0, 1].includes(result.status)) return null;

  const seen = new Set();
  const coordinates = [];
  for (const raw of result.stdout.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const match = raw.match(/^(.*):(\d+):/);
    if (!match) continue;
    const file = match[1];
    const lineNo = Number(match[2]);
    if (!file || Number.isNaN(lineNo)) continue;
    const key = `${file}:${lineNo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    coordinates.push({ file, lineNo });
  }
  return coordinates;
}

async function readSelectedJsonLines(file, lineNumbers) {
  const selected = new Set(lineNumbers);
  const rows = [];
  let lineNo = 0;
  const input = fs.createReadStream(file, { encoding: "utf8" });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      lineNo += 1;
      if (!selected.has(lineNo)) continue;
      rows.push({ file, lineNo, line });
      if (rows.length === selected.size) break;
    }
  } finally {
    rl.close();
    input.destroy();
  }
  return rows;
}

function readJsonLines(file) {
  try {
    return fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line, index) => ({ file, lineNo: index + 1, line }))
      .filter(({ line }) => line.trim().length > 0);
  } catch {
    return [];
  }
}

async function scanMatchingJsonLines(roots, pattern, stats, onRecord, fullScan = false) {
  if (roots.length === 0) return;
  const started = Date.now();
  const allFiles = () =>
    roots.flatMap((root) => walkFiles(root, (file) => file.endsWith(".jsonl")));
  const coordinates = fullScan ? null : rgMatchingCoordinates(roots, pattern);

  let inputs = [];
  if (coordinates !== null) {
    const byFile = new Map();
    for (const item of coordinates) {
      if (!byFile.has(item.file)) byFile.set(item.file, []);
      byFile.get(item.file).push(item.lineNo);
    }
    for (const [file, lineNumbers] of byFile) {
      inputs.push(...(await readSelectedJsonLines(file, lineNumbers)));
    }
    addStrategy(stats, "ripgrep-coordinate-prefilter");
    stats.matchedFiles += byFile.size;
  } else {
    const prefilter = new RegExp(pattern);
    inputs = allFiles().flatMap((file) =>
      readJsonLines(file).filter(({ line }) => fullScan || prefilter.test(line)),
    );
    addStrategy(stats, fullScan ? "full-jsonl-scan" : "full-jsonl-fallback");
    stats.matchedFiles += new Set(inputs.map((item) => item.file)).size;
  }

  stats.matchedLines += inputs.length;
  for (const item of inputs) {
    let record;
    try {
      record = JSON.parse(item.line);
    } catch {
      stats.parseErrors += 1;
      continue;
    }
    stats.parsedRecords += 1;
    onRecord(record, item.file, item.lineNo);
  }
  stats.elapsedMs += Date.now() - started;
}

function rgMatchingFiles(roots, pattern, glob) {
  if (roots.length === 0) return null;
  const args = [
    "-l",
    "--no-heading",
    "--color",
    "never",
    "--no-messages",
    "--glob",
    glob,
    "-e",
    pattern,
    ...roots,
  ];
  const result = spawnSync("rg", args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });

  if (result.error) return null;
  if (![0, 1].includes(result.status)) return null;
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

async function scanMatchingJsonFiles(roots, pattern, stats, onRecord, fullScan = false) {
  if (roots.length === 0) return;
  const started = Date.now();
  const allFiles = () =>
    roots.flatMap((root) => walkFiles(root, (file) => file.endsWith(".json")));

  let files;
  if (fullScan) {
    files = allFiles();
    addStrategy(stats, "full-json-scan");
  } else {
    files = rgMatchingFiles(roots, pattern, "*.json");
    if (files === null) {
      const prefilter = new RegExp(pattern);
      files = allFiles().filter((file) => {
        try {
          return prefilter.test(fs.readFileSync(file, "utf8"));
        } catch {
          return false;
        }
      });
      addStrategy(stats, "full-json-fallback");
    } else {
      addStrategy(stats, "ripgrep-file-prefilter");
    }
  }

  stats.matchedFiles += new Set(files).size;
  stats.matchedLines += files.length;
  for (const file of files) {
    const parsed = readJsonFile(file);
    if (parsed === undefined) {
      stats.parseErrors += 1;
      continue;
    }
    const records = Array.isArray(parsed) ? parsed : [parsed];
    for (const record of records) {
      stats.parsedRecords += 1;
      onRecord(record, file, null);
    }
  }
  stats.elapsedMs += Date.now() - started;
}

function rgPathMatches(roots, pattern, options = {}) {
  if (roots.length === 0) return null;
  const args = [
    "-n",
    "-o",
    "--no-heading",
    "--color",
    "never",
    "--no-messages",
  ];
  if (options.binary) args.push("-a");
  if (options.glob) args.push("--glob", options.glob);
  args.push("-e", pattern, ...roots);

  const result = spawnSync("rg", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) return null;
  if (![0, 1].includes(result.status)) return null;
  return result.stdout.split(/\r?\n/).filter((line) => line.trim().length > 0);
}

function fileMatchesGlob(file, glob) {
  if (!glob) return true;
  if (glob.startsWith("**/")) return path.basename(file) === glob.slice(3);
  return path.basename(file) === glob;
}

function fallbackPathMatches(skills, roots, pattern, stats, options, kind, scanOptions) {
  const re = new RegExp(pattern, "g");
  const files = roots.flatMap((root) =>
    walkFiles(root, (file) => fileMatchesGlob(file, scanOptions.glob)),
  );
  const matchedFiles = new Set();

  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, "latin1");
    } catch {
      continue;
    }

    for (const match of text.matchAll(re)) {
      matchedFiles.add(file);
      stats.matchedLines += 1;
      stats.parsedRecords += 1;
      addSkillPathReferences(skills, options, match[0], {
        ts: fileTimestamp(file),
        kind,
        source: sourcePointer(file, null),
        stats,
      });
    }
  }
  stats.matchedFiles += matchedFiles.size;
}

function scanPathMatchesInRoots(skills, roots, pattern, stats, options, kind, scanOptions = {}) {
  if (roots.length === 0) return;
  const started = Date.now();
  const rows = rgPathMatches(roots, pattern, scanOptions);
  if (rows === null) {
    addStrategy(stats, "full-path-fallback");
    fallbackPathMatches(skills, roots, pattern, stats, options, kind, scanOptions);
    stats.elapsedMs += Date.now() - started;
    return;
  }

  addStrategy(stats, "ripgrep-path-prefilter");
  const matchedFiles = new Set();
  for (const row of rows) {
    const match = row.match(/^(.*):(\d+):(.*)$/);
    if (!match) continue;
    const file = match[1];
    const lineNo = Number(match[2]);
    const pathText = match[3];
    matchedFiles.add(file);
    stats.matchedLines += 1;
    stats.parsedRecords += 1;
    addSkillPathReferences(skills, options, pathText, {
      ts: fileTimestamp(file),
      kind,
      source: sourcePointer(file, Number.isNaN(lineNo) ? null : lineNo),
      stats,
    });
  }
  stats.matchedFiles += matchedFiles.size;
  stats.elapsedMs += Date.now() - started;
}

async function scanCodex(skills, options, stats) {
  const roots = existingRoots([
    path.join(options.codexDir, "archived_sessions"),
    path.join(options.codexDir, "sessions"),
  ]);
  const pattern =
    "<skill>\\\\n<name>[^<]+</name>\\\\n<path>[^<]+/SKILL\\.md</path>";

  await scanMatchingJsonLines(
    roots,
    pattern,
    stats.codex,
    (record, file, lineNo) => {
      const ts = timestampFromRecord(record);
      const text = jsonStrings(record).join("\n");

      for (const blockMatch of text.matchAll(SKILL_BLOCK_RE)) {
        const name = blockMatch[1]?.trim();
        const skillPath = blockMatch[2]?.trim();
        if (!name || !skillPath) continue;
        if (
          addPathEvidence(
            skills,
            options.skillsDir,
            skillPath,
            name,
            {
              ts,
              kind: "codex_skill_block",
              source: `${sourceLabel(file)}:${lineNo}`,
            },
            true,
          )
        ) {
          stats.codex.evidence += 1;
        }
      }

      addSkillPathReferences(skills, options, text, {
        ts,
        kind: "codex_path_reference",
        source: sourcePointer(file, lineNo),
        stats: stats.codex,
      });
    },
    options.fullScan,
  );
}

function claudeAliases(claudeDir, skillsDir) {
  const aliases = new Map();
  const claudeSkills = path.join(claudeDir, "skills");
  if (!fs.existsSync(claudeSkills)) return aliases;

  for (const entry of fs.readdirSync(claudeSkills, { withFileTypes: true })) {
    const fullPath = path.join(claudeSkills, entry.name);
    let resolved;
    try {
      resolved = fs.realpathSync(fullPath);
    } catch {
      continue;
    }
    if (!withinRoot(resolved, skillsDir)) continue;
    const name = path.basename(
      resolved.endsWith("SKILL.md") ? path.dirname(resolved) : resolved,
    );
    aliases.set(entry.name, name);
  }
  return aliases;
}

async function scanClaude(skills, options, stats) {
  const aliases = claudeAliases(options.claudeDir, options.skillsDir);
  const jsonlRoots = existingRoots([
    path.join(options.claudeDir, "history.jsonl"),
    path.join(options.claudeDir, "projects"),
    path.join(options.claudeAppDir, "claude-code-sessions"),
    path.join(options.claudeAppDir, "local-agent-mode-sessions"),
  ]);
  const pattern =
    `"attributionSkill"|${skillPathSearchPattern(options.skillsDir)}`;

  const onRecord = (record, file, lineNo) => {
    const ts = timestampFromRecord(record) || fileTimestamp(file);

    for (const attributionSkill of attributionSkills(record)) {
      const name = aliases.get(attributionSkill) || attributionSkill;
      if (
        addEvidence(
          skills,
          name,
          {
            ts,
            kind: "claude_attribution_skill",
            source: sourcePointer(file, lineNo),
          },
          true,
        )
      ) {
        stats.claude.evidence += 1;
      }
    }

    addSkillPathReferences(skills, options, jsonStrings(record).join("\n"), {
      ts,
      kind: "claude_path_reference",
      source: sourcePointer(file, lineNo),
      aliases,
      stats: stats.claude,
    });
  };

  await scanMatchingJsonLines(
    jsonlRoots,
    pattern,
    stats.claude,
    onRecord,
    options.fullScan,
  );

  await scanMatchingJsonFiles(
    existingRoots([
      path.join(options.claudeDir, "tasks"),
      path.join(options.claudeDir, "sessions"),
      path.join(options.claudeAppDir, "claude-code-sessions"),
      path.join(options.claudeAppDir, "local-agent-mode-sessions"),
    ]),
    pattern,
    stats.claude,
    onRecord,
    options.fullScan,
  );
}

async function scanOpencode(skills, options, stats) {
  const roots = existingRoots([
    path.join(options.opencodeDir, "storage", "message"),
    path.join(options.opencodeDir, "storage", "part"),
    path.join(options.opencodeDir, "storage", "session", "message"),
    path.join(options.opencodeDir, "storage", "session", "part"),
  ]);
  const pattern = skillPathSearchPattern(options.skillsDir);

  await scanMatchingJsonFiles(
    roots,
    pattern,
    stats.opencode,
    (record, file) => {
      const ts = timestampFromRecord(record) || fileTimestamp(file);
      addStructuredToolReadEvidence(skills, options, record, {
        ts,
        kind: "opencode_tool_read_skill",
        source: sourcePointer(file, null),
        stats: stats.opencode,
      });
      addSkillPathReferences(skills, options, jsonStrings(record).join("\n"), {
        ts,
        kind: "opencode_path_reference",
        source: sourcePointer(file, null),
        stats: stats.opencode,
      });
    },
    options.fullScan,
  );
}

function scanCursor(skills, options, stats) {
  const roots = existingRoots([options.cursorDir]);
  scanPathMatchesInRoots(
    skills,
    roots,
    skillPathSearchPattern(options.skillsDir),
    stats.cursor,
    options,
    "cursor_path_reference",
    { binary: true, glob: "**/store.db" },
  );
}

function scanFilesystem(skills, options, stats) {
  const roots = existingRoots(options.evidenceDirs || []);
  scanPathMatchesInRoots(
    skills,
    roots,
    skillPathSearchPattern(options.skillsDir),
    stats.filesystem,
    options,
    "filesystem_path_reference",
  );
}

export function newStats() {
  const scan = () => ({
    strategy: "not-run",
    elapsedMs: 0,
    matchedLines: 0,
    parsedRecords: 0,
    parseErrors: 0,
    evidence: 0,
    matchedFiles: 0,
  });
  return {
    elapsedMs: 0,
    codex: scan(),
    claude: scan(),
    opencode: scan(),
    cursor: scan(),
    filesystem: scan(),
  };
}

export async function scanEvidence(skills, options) {
  const stats = newStats();
  const started = Date.now();
  if (options.source === "codex" || options.source === "all") {
    await scanCodex(skills, options, stats);
  }
  if (options.source === "claude" || options.source === "all") {
    await scanClaude(skills, options, stats);
  }
  if (options.source === "opencode" || options.source === "all") {
    await scanOpencode(skills, options, stats);
  }
  if (options.source === "cursor" || options.source === "all") {
    scanCursor(skills, options, stats);
  }
  if (options.source === "filesystem" || options.source === "all") {
    scanFilesystem(skills, options, stats);
  }
  stats.elapsedMs = Date.now() - started;
  return stats;
}
