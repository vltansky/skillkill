# skill-cleanup CLI Design

## Problem

Local agent skill directories accumulate over time. Some are actively used,
some were used long ago, and some were installed but never selected by an
agent. Manual cleanup is risky because skill names alone do not tell us whether
a skill is still useful.

`skill-cleanup` should answer two questions:

1. Which installed skills have strong evidence of recent use?
2. Which skills are reasonable cleanup candidates?

## Goals

- Provide a terminal-first cleanup workflow.
- Keep the default command non-destructive.
- Use strong transcript evidence for usage decisions.
- Produce copy-pasteable removal commands.
- Support machine-readable output for reports and automation.
- Make cleanup explicit, reversible, and easy to audit.

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

Weak evidence:

- Raw path mentions in chat history.
- `SKILL.md` access time.

Weak evidence may be displayed as context, but must not make a skill safe or
unsafe by itself.

## Candidate Rules

Default thresholds:

- Previously used skills become stale after 45 days without strong evidence.
- Never-used skills become candidates 7 days after install.
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
skill-cleanup
skill-cleanup --source codex
skill-cleanup --source claude
skill-cleanup --unused-days 60
skill-cleanup --unused-installed-days 14
skill-cleanup --commands
skill-cleanup --json
skill-cleanup --csv /tmp/skill-cleanup.csv
skill-cleanup --snapshot ~/.codex/skill-cleanup/snapshots.jsonl
skill-cleanup --apply
skill-cleanup --undo latest
```

Suggested semantics:

- `skill-cleanup`: dry-run table, candidates first.
- `--commands`: print every candidate removal command.
- `--json`: print full payload for automation.
- `--csv`: write tabular rows for spreadsheet review.
- `--snapshot`: append JSONL scan results for longitudinal tracking.
- `--apply`: move candidates into a local quarantine run and write an undo
  manifest.
- `--undo latest`: restore the most recent quarantine run.

`--delete` may be accepted as a compatibility alias, but docs should prefer
`--apply`. The word "apply" fits maintenance CLIs where the default is preview
and a flag applies the proposed changes.

## Safety

The destructive path should:

- Require `--apply`.
- Print the number of candidates before cleanup.
- Move candidates into a quarantine run under the state directory.
- Write a manifest with original and quarantined paths.
- Print every moved path and an undo command.
- Keep dot-prefixed system skills unless a future explicit override exists.
- Exit non-zero on scan errors that make evidence incomplete.

Possible future hardening:

- `--apply --yes` for non-interactive cleanup, with interactive confirmation
  when attached to a TTY.
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

- Should cleanup require `--apply` only, or `--apply --yes` for non-interactive
  safety?
- Should this be a standalone package, a local script, or part of a broader
  agent-maintenance CLI?
- Should never-used skills be grouped separately from stale-used skills in the
  default table?
- What retention policy should old quarantine runs use?
