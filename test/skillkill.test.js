import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { main } from "../src/app.js";
import { renderInteractiveScreen, shouldRunInteractive } from "../src/interactive.js";
import { buildRows } from "../src/model.js";
import { loadOmitPatterns } from "../src/omit.js";
import { collectSkills, scanEvidence } from "../src/scan.js";
import { formatCommands } from "../src/output.js";

const NOW = new Date("2026-06-15T00:00:00Z");

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skillkill-test-"));
  const skillsDir = path.join(root, "skills");
  const codexDir = path.join(root, "codex");
  const claudeDir = path.join(root, "claude");
  const claudeAppDir = path.join(root, "claude-app");
  const opencodeDir = path.join(root, "opencode");
  const cursorDir = path.join(root, "cursor");
  const evidenceDir = path.join(root, "evidence");
  const stateDir = path.join(root, "state");
  fs.mkdirSync(path.join(codexDir, "sessions"), { recursive: true });
  fs.mkdirSync(path.join(claudeDir, "projects"), { recursive: true });

  const skillPath = (name) => path.join(skillsDir, name, "SKILL.md");
  const writeSkill = (name) => {
    fs.mkdirSync(path.dirname(skillPath(name)), { recursive: true });
    fs.writeFileSync(skillPath(name), `---\nname: ${name}\n---\n# ${name}\n`);
  };

  for (const name of [
    "stale-skill",
    "recent-skill",
    "weak-only",
    "never-used",
    ".system-skill",
  ]) {
    writeSkill(name);
  }

  fs.writeFileSync(
    path.join(codexDir, "sessions", "session.jsonl"),
    [
      JSON.stringify({
        timestamp: "2026-04-01T00:00:00Z",
        message: `<skill>\n<name>stale-skill</name>\n<path>${skillPath("stale-skill")}</path>\n</skill>`,
      }),
      JSON.stringify({
        timestamp: "2026-06-14T00:00:00Z",
        message: `Mention only: ${skillPath("weak-only")}`,
      }),
    ].join("\n"),
  );

  fs.writeFileSync(
    path.join(claudeDir, "projects", "project.jsonl"),
    `${JSON.stringify({
      timestamp: "2026-06-10T00:00:00Z",
      attributionSkill: "recent-skill",
    })}\n`,
  );

  return {
    root,
    skillsDir,
    codexDir,
    claudeDir,
    claudeAppDir,
    opencodeDir,
    cursorDir,
    evidenceDir,
    stateDir,
    skillPath,
    writeSkill,
  };
}

test("builds rows from strong Codex and Claude evidence", async () => {
  const fixture = makeFixture();
  const skills = collectSkills(fixture.skillsDir);
  await scanEvidence(skills, {
    skillsDir: fixture.skillsDir,
    codexDir: fixture.codexDir,
    claudeDir: fixture.claudeDir,
    claudeAppDir: fixture.claudeAppDir,
    opencodeDir: fixture.opencodeDir,
    cursorDir: fixture.cursorDir,
    source: "all",
    fullScan: true,
  });

  const rows = buildRows(skills, {
    unusedDays: 45,
    unusedInstalledDays: 0,
    now: NOW,
  });

  const byName = new Map(rows.map((row) => [row.skill, row]));
  assert.equal(byName.get("stale-skill").cleanup_candidate, true);
  assert.match(byName.get("stale-skill").cleanup_reason, /last strong use/);
  assert.equal(byName.get("stale-skill").codex_strong_count, 1);

  assert.equal(byName.get("recent-skill").cleanup_candidate, false);
  assert.equal(byName.get("recent-skill").claude_strong_count, 1);

  assert.equal(byName.get("weak-only").strong_count, 0);
  assert.equal(byName.get("weak-only").weak_path_refs, 1);
  assert.equal(byName.get("weak-only").cleanup_candidate, false);
  assert.match(byName.get("weak-only").cleanup_reason, /recent weak signal/);

  assert.equal(byName.get(".system-skill").cleanup_candidate, false);
  assert.equal(rows[0].cleanup_candidate, true);
});

test("tracks Claude app, OpenCode, Cursor, and custom evidence signals", async () => {
  const fixture = makeFixture();
  for (const name of [
    "claude-app-skill",
    "opencode-only",
    "opencode-read",
    "cursor-only",
    "extra-evidence",
  ]) {
    fixture.writeSkill(name);
  }

  const claudeSessionDir = path.join(fixture.claudeAppDir, "claude-code-sessions", "session");
  fs.mkdirSync(claudeSessionDir, { recursive: true });
  fs.writeFileSync(
    path.join(claudeSessionDir, "conversation.json"),
    JSON.stringify({
      lastActivityAt: "2026-06-13T00:00:00Z",
      events: [{ attributionSkill: "claude-app-skill" }],
    }),
  );

  const opencodeMessageDir = path.join(fixture.opencodeDir, "storage", "message", "session");
  fs.mkdirSync(opencodeMessageDir, { recursive: true });
  fs.writeFileSync(
    path.join(opencodeMessageDir, "message.json"),
    JSON.stringify({
      time: { created: "2026-06-12T00:00:00Z" },
      body: `Loaded ${fixture.skillPath("opencode-only")}`,
    }),
  );

  const opencodePartDir = path.join(fixture.opencodeDir, "storage", "part", "message");
  fs.mkdirSync(opencodePartDir, { recursive: true });
  fs.writeFileSync(
    path.join(opencodePartDir, "part.json"),
    JSON.stringify({
      type: "tool",
      tool: "read",
      state: {
        status: "completed",
        input: { filePath: fixture.skillPath("opencode-read") },
        time: { end: "2026-06-11T00:00:00Z" },
      },
    }),
  );

  const cursorChatDir = path.join(fixture.cursorDir, "chat");
  fs.mkdirSync(cursorChatDir, { recursive: true });
  fs.writeFileSync(
    path.join(cursorChatDir, "store.db"),
    `blob text with ${fixture.skillPath("cursor-only")}`,
  );

  fs.mkdirSync(fixture.evidenceDir, { recursive: true });
  fs.writeFileSync(
    path.join(fixture.evidenceDir, "agent.log"),
    `referenced ${fixture.skillPath("extra-evidence")}`,
  );

  const skills = collectSkills(fixture.skillsDir);
  const stats = await scanEvidence(skills, {
    skillsDir: fixture.skillsDir,
    codexDir: fixture.codexDir,
    claudeDir: fixture.claudeDir,
    claudeAppDir: fixture.claudeAppDir,
    opencodeDir: fixture.opencodeDir,
    cursorDir: fixture.cursorDir,
    evidenceDirs: [fixture.evidenceDir],
    source: "all",
    fullScan: false,
  });
  const rows = buildRows(skills, {
    unusedDays: 45,
    unusedInstalledDays: 0,
    now: NOW,
  });
  const byName = new Map(rows.map((row) => [row.skill, row]));

  assert.equal(byName.get("claude-app-skill").claude_strong_count, 1);
  assert.equal(byName.get("claude-app-skill").last_strong_read, "2026-06-13 00:00:00");
  assert.equal(byName.get("opencode-only").opencode_weak_count, 1);
  assert.equal(byName.get("opencode-only").cleanup_candidate, false);
  assert.match(byName.get("opencode-only").cleanup_reason, /recent weak signal/);
  assert.equal(byName.get("opencode-read").opencode_strong_count, 1);
  assert.equal(byName.get("opencode-read").last_strong_read, "2026-06-11 00:00:00");
  assert.equal(byName.get("cursor-only").cursor_weak_count, 1);
  assert.equal(byName.get("extra-evidence").filesystem_weak_count, 1);
  assert.equal(stats.opencode.evidence, 3);
  assert.equal(stats.cursor.evidence, 1);
  assert.equal(stats.filesystem.evidence, 1);
});

test("formats cleanup commands for candidates only", async () => {
  const fixture = makeFixture();
  const skills = collectSkills(fixture.skillsDir);
  await scanEvidence(skills, {
    skillsDir: fixture.skillsDir,
    codexDir: fixture.codexDir,
    claudeDir: fixture.claudeDir,
    claudeAppDir: fixture.claudeAppDir,
    opencodeDir: fixture.opencodeDir,
    cursorDir: fixture.cursorDir,
    source: "all",
    fullScan: true,
  });
  const rows = buildRows(skills, {
    unusedDays: 45,
    unusedInstalledDays: 0,
    now: NOW,
  });

  const commands = formatCommands(rows);
  assert.match(commands, /rm -rf '.*stale-skill'/);
  assert.match(commands, /rm -rf '.*never-used'/);
  assert.doesNotMatch(commands, /recent-skill/);
  assert.doesNotMatch(commands, /\.system-skill/);
});

test("omits cleanup candidates from cli patterns and omit files", async () => {
  const fixture = makeFixture();
  const omitFile = path.join(fixture.root, "omit.txt");
  fs.writeFileSync(omitFile, ["# keep these", "stale-skill", "weak-*"].join("\n"));

  const skills = collectSkills(fixture.skillsDir);
  await scanEvidence(skills, {
    skillsDir: fixture.skillsDir,
    codexDir: fixture.codexDir,
    claudeDir: fixture.claudeDir,
    claudeAppDir: fixture.claudeAppDir,
    opencodeDir: fixture.opencodeDir,
    cursorDir: fixture.cursorDir,
    source: "all",
    fullScan: true,
  });
  const rows = buildRows(skills, {
    unusedDays: 45,
    unusedInstalledDays: 0,
    now: NOW,
    omitPatterns: loadOmitPatterns({
      omitFile,
      noOmitFile: false,
      omitPatterns: ["never-used"],
    }),
  });

  const byName = new Map(rows.map((row) => [row.skill, row]));
  assert.equal(byName.get("stale-skill").cleanup_candidate, false);
  assert.equal(byName.get("stale-skill").omitted, true);
  assert.equal(byName.get("stale-skill").omit_pattern, "stale-skill");
  assert.equal(byName.get("weak-only").cleanup_candidate, false);
  assert.equal(byName.get("weak-only").omit_pattern, "weak-*");
  assert.equal(byName.get("never-used").cleanup_candidate, false);
  assert.equal(byName.get("never-used").omit_pattern, "never-used");
});

test("whitelist alias removes skills from json and commands output", async () => {
  const fixture = makeFixture();
  let jsonStdout = "";
  await main(
    [
      "--path",
      fixture.skillsDir,
      "--codex-dir",
      fixture.codexDir,
      "--claude-dir",
      fixture.claudeDir,
      "--claude-app-dir",
      fixture.claudeAppDir,
      "--opencode-dir",
      fixture.opencodeDir,
      "--cursor-dir",
      fixture.cursorDir,
      "--unused-installed-days",
      "0",
      "--whitelist",
      "stale-skill",
      "--json",
      "--full-scan",
      "--no-omit-file",
    ],
    {
      now: NOW,
      stdout: { write: (chunk) => (jsonStdout += chunk) },
      stderr: { write: () => {} },
    },
  );

  const payload = JSON.parse(jsonStdout);
  const stale = payload.rows.find((row) => row.skill === "stale-skill");
  assert.equal(payload.summary.omitted, 1);
  assert.equal(stale.cleanup_candidate, false);
  assert.equal(stale.omitted, true);

  let commandsStdout = "";
  await main(
    [
      "--path",
      fixture.skillsDir,
      "--codex-dir",
      fixture.codexDir,
      "--claude-dir",
      fixture.claudeDir,
      "--claude-app-dir",
      fixture.claudeAppDir,
      "--opencode-dir",
      fixture.opencodeDir,
      "--cursor-dir",
      fixture.cursorDir,
      "--unused-installed-days",
      "0",
      "--omit",
      "stale-skill",
      "--commands",
      "--full-scan",
      "--no-omit-file",
    ],
    {
      now: NOW,
      stdout: { write: (chunk) => (commandsStdout += chunk) },
      stderr: { write: () => {} },
    },
  );

  assert.doesNotMatch(commandsStdout, /stale-skill/);
  assert.match(commandsStdout, /never-used/);
});

test("renders interactive cleanup candidates", async () => {
  const fixture = makeFixture();
  const skills = collectSkills(fixture.skillsDir);
  await scanEvidence(skills, {
    skillsDir: fixture.skillsDir,
    codexDir: fixture.codexDir,
    claudeDir: fixture.claudeDir,
    claudeAppDir: fixture.claudeAppDir,
    opencodeDir: fixture.opencodeDir,
    cursorDir: fixture.cursorDir,
    source: "all",
    fullScan: true,
  });
  const rows = buildRows(skills, {
    unusedDays: 45,
    unusedInstalledDays: 0,
    now: NOW,
  });

  const screen = renderInteractiveScreen(
    rows,
    { cursor: 0, selected: new Set(["stale-skill"]) },
    { columns: 120, rows: 24 },
  );

  assert.match(screen, /skillkill interactive cleanup/);
  assert.match(screen, /2 cleanup candidates/);
  assert.match(screen, /\[x\] stale-skill/);
  assert.match(screen, /space\/x select/);
  assert.doesNotMatch(screen, /recent-skill/);
});

test("interactive mode defaults only for real terminals", () => {
  const defaults = {
    noInteractive: false,
    apply: false,
    commands: false,
    json: false,
    undo: "",
    csv: "",
    snapshot: "",
  };

  assert.equal(
    shouldRunInteractive(defaults, { stdin: { isTTY: true }, stdout: { isTTY: true } }),
    true,
  );
  assert.equal(
    shouldRunInteractive(defaults, { stdin: { isTTY: false }, stdout: { isTTY: true } }),
    false,
  );
  assert.equal(
    shouldRunInteractive({ ...defaults, noInteractive: true }, {
      stdin: { isTTY: true },
      stdout: { isTTY: true },
    }),
    false,
  );
});

test("apply quarantines candidates and undo restores them", async () => {
  const fixture = makeFixture();
  let stdout = "";
  await main(
    [
      "--path",
      fixture.skillsDir,
      "--codex-dir",
      fixture.codexDir,
      "--claude-dir",
      fixture.claudeDir,
      "--claude-app-dir",
      fixture.claudeAppDir,
      "--opencode-dir",
      fixture.opencodeDir,
      "--cursor-dir",
      fixture.cursorDir,
      "--unused-installed-days",
      "0",
      "--state-dir",
      fixture.stateDir,
      "--apply",
      "--full-scan",
    ],
    {
      now: NOW,
      stdout: { write: (chunk) => (stdout += chunk) },
      stderr: { write: () => {} },
    },
  );

  assert.match(stdout, /Applying cleanup to 2 candidates/);
  assert.match(stdout, /Undo manifest:/);
  assert.equal(fs.existsSync(path.dirname(fixture.skillPath("stale-skill"))), false);
  assert.equal(fs.existsSync(path.dirname(fixture.skillPath("never-used"))), false);
  assert.equal(fs.existsSync(path.dirname(fixture.skillPath("weak-only"))), true);
  assert.equal(fs.existsSync(path.dirname(fixture.skillPath("recent-skill"))), true);
  assert.equal(fs.existsSync(path.dirname(fixture.skillPath(".system-skill"))), true);

  const latestState = JSON.parse(
    fs.readFileSync(path.join(fixture.stateDir, "latest.json"), "utf8"),
  );
  assert.equal(fs.existsSync(latestState.manifest), true);

  let undoStdout = "";
  await main(
    ["--state-dir", fixture.stateDir, "--undo", "latest"],
    {
      now: NOW,
      stdout: { write: (chunk) => (undoStdout += chunk) },
      stderr: { write: () => {} },
    },
  );

  assert.match(undoStdout, /Restored 2 skills/);
  assert.equal(fs.existsSync(path.dirname(fixture.skillPath("stale-skill"))), true);
  assert.equal(fs.existsSync(path.dirname(fixture.skillPath("never-used"))), true);
  assert.equal(fs.existsSync(path.dirname(fixture.skillPath("weak-only"))), true);
  assert.equal(fs.existsSync(path.dirname(fixture.skillPath("recent-skill"))), true);
  assert.equal(fs.existsSync(path.dirname(fixture.skillPath(".system-skill"))), true);
});
