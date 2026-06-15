import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { main } from "../src/app.js";
import { buildRows } from "../src/model.js";
import { collectSkills, scanEvidence } from "../src/scan.js";
import { formatCommands } from "../src/output.js";

const NOW = new Date("2026-06-15T00:00:00Z");

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skillkill-test-"));
  const skillsDir = path.join(root, "skills");
  const codexDir = path.join(root, "codex");
  const claudeDir = path.join(root, "claude");
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

  return { root, skillsDir, codexDir, claudeDir, stateDir, skillPath };
}

test("builds rows from strong Codex and Claude evidence", async () => {
  const fixture = makeFixture();
  const skills = collectSkills(fixture.skillsDir);
  await scanEvidence(skills, {
    skillsDir: fixture.skillsDir,
    codexDir: fixture.codexDir,
    claudeDir: fixture.claudeDir,
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
  assert.equal(byName.get("weak-only").cleanup_candidate, true);
  assert.match(byName.get("weak-only").cleanup_reason, /never used/);

  assert.equal(byName.get(".system-skill").cleanup_candidate, false);
  assert.equal(rows[0].cleanup_candidate, true);
});

test("formats cleanup commands for candidates only", async () => {
  const fixture = makeFixture();
  const skills = collectSkills(fixture.skillsDir);
  await scanEvidence(skills, {
    skillsDir: fixture.skillsDir,
    codexDir: fixture.codexDir,
    claudeDir: fixture.claudeDir,
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

  assert.match(stdout, /Applying cleanup to 3 candidates/);
  assert.match(stdout, /Undo manifest:/);
  assert.equal(fs.existsSync(path.dirname(fixture.skillPath("stale-skill"))), false);
  assert.equal(fs.existsSync(path.dirname(fixture.skillPath("never-used"))), false);
  assert.equal(fs.existsSync(path.dirname(fixture.skillPath("weak-only"))), false);
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

  assert.match(undoStdout, /Restored 3 skills/);
  assert.equal(fs.existsSync(path.dirname(fixture.skillPath("stale-skill"))), true);
  assert.equal(fs.existsSync(path.dirname(fixture.skillPath("never-used"))), true);
  assert.equal(fs.existsSync(path.dirname(fixture.skillPath("weak-only"))), true);
  assert.equal(fs.existsSync(path.dirname(fixture.skillPath("recent-skill"))), true);
  assert.equal(fs.existsSync(path.dirname(fixture.skillPath(".system-skill"))), true);
});
