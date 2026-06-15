# skillkill Plan

## Direction

Build `skillkill` as a narrow, npkill-style cleanup CLI for one artifact
class: installed local agent skills.

The command should scan, rank, explain, and optionally quarantine stale skills
with an undo manifest. It should not become a broad disk cleaner, package
manager, marketplace manager, or browser/TUI-first review app in first release.

## Product Shape

The closest reference is `npx npkill`:

- Find a specific kind of local developer artifact.
- Show candidates with useful context.
- Make cleanup explicit and reviewable.
- Support automation output.

For `skillkill`, the artifact is a skill directory, and the context is usage
evidence from Codex and Claude transcripts.

## V1 Scope

Commands:

```bash
skillkill
skillkill --path ~/.agents/skills
skillkill --source codex
skillkill --source claude
skillkill --commands
skillkill --json
skillkill --csv /tmp/skillkill.csv
skillkill --snapshot ~/.codex/skillkill/snapshots.jsonl
skillkill --apply
skillkill --undo latest
```

Behavior:

- Dry-run by default.
- Candidates first in the default table.
- Strong evidence from Codex injected skill blocks and Claude
  `attributionSkill`.
- Weak evidence shown only as context.
- `--apply` moves candidates into a local quarantine run and prints every moved
  path.
- `--undo latest` restores the most recent quarantine run.
- Dot-prefixed system skills are protected by default.

Outputs:

- Human table
- Copy-paste commands
- JSON
- CSV
- JSONL snapshot

## V1 Implementation Steps

1. Projectize the prototype scanner.
   - Move scanner code from the installed skill prototype into this project.
   - Split the script into small modules for args, scanning, row building, and
     output formatting.
   - Add a `bin` entry for `skillkill`.

2. Add fixture-based tests.
   - Codex transcript with injected skill block.
   - Claude transcript with `attributionSkill`.
   - Path mentions that remain weak evidence.
   - Never-used skill older than threshold.
   - Dot-prefixed protected skill.

3. Implement CLI output contract.
   - Default table.
   - `--commands`.
   - `--json`.
   - `--csv`.
   - `--snapshot`.

4. Implement deletion safely.
   - `--apply` only.
   - Print candidate count before deletion.
   - Move candidates to a quarantine run.
   - Write an undo manifest.
   - Print moved paths and the undo command.
   - Preserve protected skills.

5. Wire local install.
   - Link `$HOME/.local/bin/skillkill` to the project entrypoint.
   - Update the old installed skill doc to delegate to the CLI.

## P1 After V1

- Directory size column for each skill.
- `--exclude <skill>` and `--include <skill>`.
- `--min-age`, `--used-before`, or similar filters if the table gets noisy.
- Config file for thresholds and protected skills.
- Optional permanent purge of old quarantine runs.
- Optional interactive TUI if terminal table review becomes painful.

## Explicit Non-Goals

- Agents UI review flow.
- TUI as the default experience.
- Deleting files inside a skill directory.
- Cleaning unrelated caches, worktrees, packages, or project artifacts.
- Publishing to npm directly from a local shell.
