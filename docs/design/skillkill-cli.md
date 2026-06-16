# skillkill CLI Design

## Problem

Local agent skill directories accumulate over time. Some are actively used,
some were used long ago, and some were installed but never selected by an
agent. Manual cleanup is risky because skill names alone do not tell us whether
a skill is still useful.

`skillkill` should answer two questions:

1. Which installed skills have strong evidence of recent use?
2. Which skills are reasonable cleanup candidates?

## Goals

- Provide a terminal-first cleanup workflow.
- Keep the default command non-destructive.
- Use strong transcript evidence for usage decisions.
- Use weak local evidence to avoid risky cleanup when provider-native signals
  are missing.
- Produce copy-pasteable removal commands.
- Support machine-readable output for reports and automation.
- Make cleanup explicit, reversible, and easy to audit.
- Allow users to omit known-good skills from cleanup candidates.

## Non-Goals

- No Agents UI review flow.
- No automatic deletion by default.
- No reliance on filesystem `atime` as proof of agent selection.
- No cross-machine sync or marketplace management.
- No package publishing decision yet.

## Evidence Model

Strong evidence:

- Codex transcript JSONL contains an injected `<skill><name>...<path>...` block.
- Claude transcript JSONL contains `attributionSkill`.
- Claude app session JSON contains `attributionSkill`.

Weak evidence:

- Raw path mentions in chat history.
- OpenCode message JSON path mentions.
- Cursor chat store path mentions.
- User-provided `--evidence-dir` path mentions.
- `SKILL.md` access time.

Weak evidence may be displayed as context. Recent weak evidence defers cleanup,
but it does not become strong evidence and should be labeled as lower
confidence.

## Candidate Rules

Default thresholds:

- Previously used skills become stale after 45 days without strong evidence.
- Never-used skills become candidates 7 days after install.
- Skills with weak evidence in the last 45 days are not automatic candidates.
- Dot-prefixed system skills are preserved by default.

A candidate row should include:

- Skill name
- Skill path
- Last strong use timestamp
- Codex strong evidence count
- Claude strong evidence count
- Candidate reason
- Removal command

## Command Surface

```bash
skillkill
skillkill --source codex
skillkill --source claude
skillkill --source opencode
skillkill --source cursor
skillkill --source filesystem --evidence-dir ~/.continue
skillkill --omit simplify
skillkill --whitelist "ck-*"
skillkill --no-interactive
skillkill --unused-days 60
skillkill --unused-installed-days 14
skillkill --protect-weak-days 30
skillkill --commands
skillkill --json
skillkill --csv /tmp/skillkill.csv
skillkill --snapshot ~/.codex/skillkill/snapshots.jsonl
skillkill --apply
skillkill --undo latest
```

Suggested semantics:

- `skillkill`: interactive candidate review when stdin/stdout are terminals.
- `--no-interactive`: static dry-run table, candidates first.
- `--commands`: print every candidate removal command.
- `--json`: print full payload for automation.
- `--csv`: write tabular rows for spreadsheet review.
- `--snapshot`: append JSONL scan results for longitudinal tracking.
- `--source`: choose Codex, Claude, OpenCode, Cursor, extra filesystem roots,
  or all known local sources.
- `--evidence-dir`: add local transcript/log directories that should count as
  weak path-reference evidence.
- `--protect-weak-days`: keep recent weak evidence out of cleanup candidates.
- `--omit` / `--whitelist`: remove exact or glob-matched skill names and paths
  from cleanup candidates.
- `--omit-file`: load persistent omit patterns from a file.
- `--apply`: move candidates into a local quarantine run and write an undo
  manifest.
- `--undo latest`: restore the most recent quarantine run.

`--delete` may be accepted as a compatibility alias, but docs should prefer
`--apply`. The word "apply" fits maintenance CLIs where the default is preview
and a flag applies the proposed changes.

## Safety

The destructive path should:

- Require explicit confirmation in interactive mode.
- Require `--apply` for non-interactive cleanup.
- Print the number of candidates before cleanup.
- Move candidates into a quarantine run under the state directory.
- Write a manifest with original and quarantined paths.
- Print every moved path and an undo command.
- Keep dot-prefixed system skills unless a future explicit override exists.
- Keep omitted skills out of interactive selection and non-interactive apply.
- Exit non-zero on scan errors that make evidence incomplete.

Possible future hardening:

- `--apply --yes` for non-interactive cleanup once `--apply` gains a prompt.
- `--exclude <skill>` and `--include <skill>` for explicit review decisions.
- `--purge` for deleting old quarantine runs after a retention period.

## Prior Art

- Git `clean` requires force for deletion and documents `--dry-run` as a way to
  show what would be removed without deleting anything:
  https://github.com/git/git/blob/master/Documentation/git-clean.adoc#L35-L54
- Git sparse-checkout `clean` similarly refuses deletion without `--force` and
  uses `--dry-run` to list removable directories:
  https://github.com/git/git/blob/master/Documentation/git-sparse-checkout.adoc#L131-L137
- pip groups cache cleanup under clear verbs like `info`, `list`, `remove`, and
  `purge`:
  https://github.com/pypa/pip/blob/main/src/pip/_internal/commands/cache.py#L55-L78
- pip reports removed file and directory totals after cache removal:
  https://github.com/pypa/pip/blob/main/src/pip/_internal/commands/cache.py#L213-L216
- pnpm `storePrune` is a direct terminal maintenance action, not a browser
  review flow:
  https://github.com/pnpm/pnpm/blob/main/store/commands/src/store/storePrune.ts#L20-L37

## Open Questions

- Should non-interactive cleanup require `--apply` only, or `--apply --yes`?
- Should this be a standalone package, a local script, or part of a broader
  agent-maintenance CLI?
- Should never-used skills be grouped separately from stale-used skills in the
  default table?
- What retention policy should old quarantine runs use?
