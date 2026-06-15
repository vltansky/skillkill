# ADR: Build `skill-cleanup` as a terminal-first cleanup CLI

## Status

Proposed

## Context

The initial skill usage audit workflow grew from a skill-specific script into an
Agents UI review flow. That added useful visualization, but it also added too
much surface area for a local maintenance task.

The desired workflow is closer to existing cleanup CLIs for stale local files,
caches, and worktrees:

- Run a command.
- Review candidates in the terminal.
- Optionally export data.
- Apply deletion only through an explicit flag.

Prior art points in the same direction:

- Git `clean` separates preview from deletion with `--dry-run` and `--force`.
- pip exposes cache cleanup as terminal verbs and reports removal totals.
- pnpm exposes store pruning as a direct CLI maintenance action.
- `npkill` is a focused developer-artifact cleaner: it scans for
  `node_modules`, shows size and context, supports deletion from the terminal,
  and exposes JSON output.
- `killpy` applies a similar shape to Python environments, with both TUI and
  headless command modes.
- `dwipe`, `mac-cleaner-cli`, and `null-e` show useful safety ideas such as
  two-step deletion, trash mode, risk tiers, and category selection.

The research conclusion is that `skill-cleanup` should be "npkill for installed
agent skills": narrow artifact class, clear evidence, terminal review, explicit
apply. It should not start as a broad developer disk cleaner.

## Decision

Build `skill-cleanup` as a terminal-first CLI project under
`~/projects/skill-cleanup`.

The CLI will:

- Scan local installed agent skills.
- Use Codex and Claude transcript evidence by default.
- Treat Codex injected skill blocks and Claude `attributionSkill` as strong
  usage evidence.
- Treat `atime` and raw path mentions as weak context only.
- Print a dry-run candidate table by default.
- Put cleanup candidates first.
- Require `--apply` for deletion.
- Support `--commands`, `--json`, `--csv`, and `--snapshot`.
- Stay scoped to whole skill directories, not files inside a skill.
- Treat optional TUI/trash/risk-tier features as later improvements.

The CLI will not serve Agents UI or generate an interactive browser review.
The CLI will not clean unrelated developer artifacts such as `node_modules`,
virtualenvs, build caches, Docker data, or Xcode data.

## Consequences

Positive:

- The workflow is simpler and easier to run repeatedly.
- The destructive path is explicit.
- The output works for both humans and automation.
- The implementation can stay dependency-light.
- The product has a clear reference class: `npkill`, but for agent skills.

Negative:

- Review decisions are less visual than the Agents UI version.
- Bulk accept/reject interaction is not available in the first version.
- Users must rely on terminal output or exported CSV/JSON for review.
- The narrow scope means it will not solve broader local disk cleanup problems.

## Alternatives Considered

### Keep Agents UI Review

Rejected for the default workflow. It is richer, but too heavy for routine local
cleanup and introduces a server/browser lifecycle.

### Keep As An Installed Skill Script Only

Rejected. The maintenance behavior should live in a normal project with a
normal CLI entrypoint, not inside a skill directory.

### Delete Automatically During Scan

Rejected. Cleanup candidates are recommendations, not proof that deletion is
safe for every future workflow.

### Build A TUI First

Deferred. `npkill`, `killpy`, and `dwipe` show that a TUI can be valuable for
interactive cleanup, especially with search, multi-select, and confirmation.
For first release, a table plus JSON/CSV output is enough to validate the evidence model
and deletion contract. TUI can be added later without changing the scanner.

### Build A Broad Developer Cleaner

Rejected for this project. Tools like `mac-cleaner-cli` and `null-e` show a
broader category-based cleanup direction, but `skill-cleanup` should stay
focused on installed agent skills.

## Follow-Ups

1. Move or rewrite the current scanner into this project.
2. Split scanner, row-building, output formatting, and deletion into small
   modules.
3. Add fixture tests for Codex skill blocks, Claude `attributionSkill`, weak
   path references, never-used skills, and protected dot-prefixed skills.
4. Implement the first release command surface from `docs/plan.md`.
5. Link `$HOME/.local/bin/skill-cleanup` to the project entrypoint.
6. Update the old installed skill doc to delegate to this CLI.
7. Revisit `--trash`, `--include`, `--exclude`, and optional TUI after first release.
