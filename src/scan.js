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
    skills.set(entry.name, {
      skill: entry.name,
      path: entry.file,
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
    stats.strategy = "ripgrep-coordinate-prefilter";
    stats.matchedFiles = byFile.size;
  } else {
    const prefilter = new RegExp(pattern);
    inputs = allFiles().flatMap((file) =>
      readJsonLines(file).filter(({ line }) => fullScan || prefilter.test(line)),
    );
    stats.strategy = fullScan ? "full-jsonl-scan" : "full-jsonl-fallback";
    stats.matchedFiles = new Set(inputs.map((item) => item.file)).size;
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

async function scanCodex(skills, options, stats) {
  const roots = existingRoots([
    path.join(options.codexDir, "archived_sessions"),
    path.join(options.codexDir, "sessions"),
  ]);
  const pattern =
    "<skill>\\\\n<name>[^<]+</name>\\\\n<path>[^<]+/SKILL\\.md</path>";
  const customPathRe = dynamicSkillPathRe(options.skillsDir);

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

      for (const match of text.matchAll(AGENTS_SKILL_PATH_RE)) {
        if (
          addPathEvidence(
            skills,
            options.skillsDir,
            match.groups.path,
            match.groups.name,
            {
              ts,
              kind: "codex_path_reference",
              source: `${sourceLabel(file)}:${lineNo}`,
            },
            false,
          )
        ) {
          stats.codex.evidence += 1;
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
                ts,
                kind: "codex_path_reference",
                source: `${sourceLabel(file)}:${lineNo}`,
              },
              false,
            )
          ) {
            stats.codex.evidence += 1;
          }
        }
      }
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
  const roots = existingRoots([
    path.join(options.claudeDir, "history.jsonl"),
    path.join(options.claudeDir, "projects"),
  ]);
  const customPathPattern = options.skillsDir.includes(`${path.sep}.agents${path.sep}skills`)
    ? ""
    : `|${escapeRegExp(options.skillsDir)}\\/[^"'<>\\s/]+\\/SKILL\\.md`;
  const pattern =
    `"attributionSkill"|\\.claude/skills/[^"'<>\\s/]+/SKILL\\.md|\\.agents/skills/[^"'<>\\s/]+/SKILL\\.md${customPathPattern}`;
  const customPathRe = dynamicSkillPathRe(options.skillsDir);

  await scanMatchingJsonLines(
    roots,
    pattern,
    stats.claude,
    (record, file, lineNo) => {
      const ts = timestampFromRecord(record);

      if (typeof record.attributionSkill === "string") {
        const name = aliases.get(record.attributionSkill) || record.attributionSkill;
        if (
          addEvidence(
            skills,
            name,
            {
              ts,
              kind: "claude_attribution_skill",
              source: `${sourceLabel(file)}:${lineNo}`,
            },
            true,
          )
        ) {
          stats.claude.evidence += 1;
        }
      }

      const text = jsonStrings(record).join("\n");
      for (const match of text.matchAll(CLAUDE_SKILL_PATH_RE)) {
        const name = aliases.get(match.groups.name) || match.groups.name;
        if (
          addEvidence(
            skills,
            name,
            {
              ts,
              kind: "claude_path_reference",
              source: `${sourceLabel(file)}:${lineNo}`,
            },
            false,
          )
        ) {
          stats.claude.evidence += 1;
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
              ts,
              kind: "claude_path_reference",
              source: `${sourceLabel(file)}:${lineNo}`,
            },
            false,
          )
        ) {
          stats.claude.evidence += 1;
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
                ts,
                kind: "claude_path_reference",
                source: `${sourceLabel(file)}:${lineNo}`,
              },
              false,
            )
          ) {
            stats.claude.evidence += 1;
          }
        }
      }
    },
    options.fullScan,
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
  stats.elapsedMs = Date.now() - started;
  return stats;
}
