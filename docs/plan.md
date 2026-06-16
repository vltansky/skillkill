# skillkill Plan

## Direction

Build `skillkill` as a narrow, npkill-style cleanup CLI for one artifact
class: installed local agent skills.

The command should scan, rank, explain, and interactively quarantine stale
skills with an undo manifest. It should not become a broad disk cleaner,
package manager, marketplace manager, or browser review app in first release.

## Product Shape

The closest reference is `npx npkill`:

- Find a specific kind of local developer artifact.
- Show candidates with useful context.
- Make cleanup explicit and reviewable.
- Support automation output.

For `skillkill`, the artifact is a skill directory, and the context is usage
evidence from local agent transcript/session stores.

## V1 Scope

Commands:

```bash
skillkill
skillkill --path ~/.agents/skills
skillkill --source codex
skillkill --source claude
skillkill --source opencode
skillkill --source cursor
skillkill --source filesystem --evidence-dir ~/.continue
skillkill --omit simplify
skillkill --no-interactive
skillkill --commands
skillkill --json
skillkill --csv /tmp/skillkill.csv
skillkill --snapshot ~/.codex/skillkill/snapshots.jsonl
skillkill --apply
skillkill --undo latest
```

Behavior:

- Interactive terminal review by default when stdin/stdout are terminals.
- Static dry-run table when output is piped or `--no-interactive` is passed.
- Candidates first in both interactive and static views.
- Strong evidence from Codex injected skill blocks and Claude
  `attributionSkill`.
- Weak evidence from OpenCode message JSON, Cursor chat stores, and
  user-provided local evidence directories.
- Recent weak evidence defers cleanup by default because it may indicate use in
  tools without native skill attribution, but it stays labeled as weak.
- `--apply` moves candidates into a local quarantine run and prints every moved
  path.
- `--undo latest` restores the most recent quarantine run.
- `--omit` / `--whitelist` keeps matching skills out of cleanup candidates.
- `~/.config/skillkill/omit` stores persistent omit patterns.
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
   - Interactive default view.
   - Static table with `--no-interactive`.
   - `--commands`.
   - `--json`.
   - `--csv`.
   - `--snapshot`.
   - `--omit` and persistent omit file support.

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
- Search/filter inside the interactive view.
- `--exclude <skill>` and `--include <skill>`.
- `--min-age`, `--used-before`, or similar filters if the table gets noisy.
- Config file for thresholds and protected skills.
- Optional permanent purge of old quarantine runs.

## Explicit Non-Goals

- Agents UI review flow.
- Deleting files inside a skill directory.
- Cleaning unrelated caches, worktrees, packages, or project artifacts.
- Publishing to npm directly from a local shell.
