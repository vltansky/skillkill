# Research: Tools Like `npx npkill`

## Question

Which existing projects resemble `npx npkill`, and what should `skill-cleanup`
borrow from them?

## Short Answer

The closest pattern is a local cleanup CLI that scans a familiar developer
artifact class, shows size and context, and makes deletion explicit. `npkill`
does this for `node_modules`; `killpy` does it for Python environments; `dwipe`
does it for arbitrary directories; `mac-cleaner-cli` and `null-e` broaden the
idea into category-based developer/system cleanup.

For `skill-cleanup`, the most relevant model is not a broad system cleaner. It
is a narrow npkill-style scanner for one artifact class: installed agent skills.

## Examples

| Project | Scope | Interaction Model | What Matters For `skill-cleanup` |
| --- | --- | --- | --- |
| `zaldih/npkill` | Finds old/heavy `node_modules` folders | TUI list, keyboard delete, multi-select, filters, JSON output | Best baseline for a focused developer-artifact cleanup tool |
| `Tlaloc-Es/killpy` | Finds Python envs, caches, build artifacts | TUI plus headless commands | Strong analogue for one ecosystem's stale environments |
| `trinhminhtriet/dwipe` | Directory size visualization and cleanup | TUI navigator with two-step delete and trash toggle | Good deletion-safety interaction ideas |
| `guhcostan/mac-cleaner-cli` | macOS caches, logs, dev files, apps | Interactive category selection | Good risk-tiering model, but broader than `skill-cleanup` needs |
| `us/null-e` | Multi-language developer artifacts and caches | CLI commands plus TUI | Good broad cleanup command taxonomy and safety features |
| `ModClean/modclean` | Removes unwanted files inside `node_modules` | Pattern-based CLI/API | Good configurable pattern idea, but removes files inside packages |
| `tuananh/node-prune` | Prunes unneeded files from `node_modules` | Batch command | Good before/after size reporting, but less review-oriented |

## Project Notes

### npkill

`npkill` is the direct reference: it lists `node_modules` directories, displays
their disk usage, and lets the user delete selected folders. It can be run
without installation through `npx npkill`.

Useful patterns:

- One artifact class by default: `node_modules`.
- Starts scanning at the current directory unless a path is provided.
- Shows last workspace modification context.
- Supports keyboard-driven deletion.
- Supports search/filter and multi-select.
- Has JSON and streaming JSON output for automation.
- Has sensitive-directory exclusion and a warning for system/app-owned
  `node_modules`.

Evidence:

- Purpose and npx usage:
  https://github.com/zaldih/npkill/blob/main/README.md#L11-L18
  https://github.com/zaldih/npkill/blob/main/README.md#L62-L76
- Default scan and keyboard deletion:
  https://github.com/zaldih/npkill/blob/main/README.md#L86-L98
- Sensitive directory warning:
  https://github.com/zaldih/npkill/blob/main/README.md#L99-L101
- Search and multi-select:
  https://github.com/zaldih/npkill/blob/main/README.md#L103-L139
- Options including `--delete-all`, `--exclude-sensitive`, `--dry-run`, and JSON:
  https://github.com/zaldih/npkill/blob/main/README.md#L151-L168

### killpy

`killpy` is essentially the Python-environment cousin of `npkill`: it finds
virtual environments, caches, and build artifacts, then supports both an
interactive terminal UI and headless commands.

Useful patterns:

- Names the cleanup target clearly: Python environments.
- Supports no-install execution via `pipx run` or `uvx`.
- Separates `list`, `delete`, `stats`, `clean`, and `doctor`.
- Documents destructive behavior and recommends `--dry-run`.
- Marks actively used environments as risky.

Evidence:

- Purpose and no-install execution:
  https://github.com/Tlaloc-Es/killpy/blob/master/README.md#L5-L12
- Problem framing and TUI/headless workflow:
  https://github.com/Tlaloc-Es/killpy/blob/master/README.md#L70-L92
- Detection categories:
  https://github.com/Tlaloc-Es/killpy/blob/master/README.md#L104-L109
- CLI command family:
  https://github.com/Tlaloc-Es/killpy/blob/master/README.md#L42-L48
- Safety and dry-run:
  https://github.com/Tlaloc-Es/killpy/blob/master/README.md#L575-L581

### dwipe

`dwipe` is a generic cross-platform directory cleanup TUI. It is less
domain-specific than `npkill`, but its deletion mechanics are useful.

Useful patterns:

- Directory size visualization first.
- Navigation into folders.
- Delete requires a second confirmation keystroke.
- Optional trash mode instead of permanent deletion.
- Sorting by title or size.

Evidence:

- Purpose and features:
  https://github.com/trinhminhtriet/dwipe/blob/master/README.md#L9-L20
- Usage:
  https://github.com/trinhminhtriet/dwipe/blob/master/README.md#L43-L64
- Keybindings including two-step delete and trash toggle:
  https://github.com/trinhminhtriet/dwipe/blob/master/README.md#L66-L76

### mac-cleaner-cli

`mac-cleaner-cli` is a newer npm-runnable cleanup CLI for macOS. It is broader
than `skill-cleanup`, but its category and risk model is relevant.

Useful patterns:

- `npx` first-run workflow.
- Scan, show sizes, select exactly what to clean, then clean only selections.
- Separates safe, moderate, and risky categories.
- Hides risky items unless `--risky` is passed.
- Supports drilling into categories for folder-level selection.

Evidence:

- Quick start workflow:
  https://github.com/guhcostan/mac-cleaner-cli/blob/main/README.md#L48-L58
- Feature table including interactive selection and safe-by-default behavior:
  https://github.com/guhcostan/mac-cleaner-cli/blob/main/README.md#L66-L74
- Category risk tiers:
  https://github.com/guhcostan/mac-cleaner-cli/blob/main/README.md#L77-L92
- Interactive folder-level selection:
  https://github.com/guhcostan/mac-cleaner-cli/blob/main/README.md#L102-L115

### null-e

`null-e` is a broad Rust cleanup tool for developer machines. It is useful as a
reference for a future generalized cleanup tool, but `skill-cleanup` should stay
narrower.

Useful patterns:

- Multi-ecosystem artifact categories.
- Git protection.
- Trash by default with recovery option.
- Dry-run mode.
- JSON output.
- Separate commands for scan, clean, sweep, caches, TUI, stale projects.

Evidence:

- Scope and CLI installation:
  https://github.com/us/null-e/blob/main/README.md#L5-L35
- Developer artifact categories:
  https://github.com/us/null-e/blob/main/README.md#L80-L90
- Safety and feature list:
  https://github.com/us/null-e/blob/main/README.md#L92-L101
- Quick start and commands:
  https://github.com/us/null-e/blob/main/README.md#L150-L180

### modclean

`modclean` removes unnecessary files and folders from inside `node_modules`
based on predefined and custom glob patterns. It is useful prior art for
configurable cleanup rules, but it is riskier than `npkill` because it modifies
package contents rather than deleting whole discovered artifact folders.

Evidence:

- Purpose and pattern-based cleanup:
  https://github.com/ModClean/modclean/blob/master/README.md#L1-L17
- Rationale and warnings about testing/backups:
  https://github.com/ModClean/modclean/blob/master/README.md#L18-L32

### node-prune

`node-prune` is a small batch cleaner for unneeded files in `node_modules`,
often used for deployment/package-size optimization. It reports before/after
size, but does not appear as review-oriented as `npkill`.

Evidence:

- Purpose and use cases:
  https://github.com/tuananh/node-prune/blob/develop/README.md#L1-L13
- Usage and before/after output:
  https://github.com/tuananh/node-prune/blob/develop/README.md#L24-L42

## Design Implications For `skill-cleanup`

1. Stay narrow like `npkill`: one artifact class, installed agent skills.
2. Keep terminal-first operation; defer TUI until the table/JSON workflow feels
   insufficient.
3. Show size/context when possible: skill name, path, installed age, last strong
   use, evidence counts, and candidate reason.
4. Keep deletion explicit. Prefer `--apply`, with `--dry-run` implied by
   default behavior.
5. Add `--json` and `--csv` early; both `npkill` and `null-e` show this matters
   for automation and audit.
6. Consider `--trash` before permanent deletion. `dwipe` and `null-e` both make
   recoverability a first-class safety affordance.
7. Consider risk tiers later: normal stale skills, never-used skills, and
   protected/system skills.
8. Do not copy `modclean`'s pattern of modifying internals. For skills, delete
   or quarantine whole skill directories only.

## Best Borrowed Shape

```bash
skill-cleanup
skill-cleanup --path ~/.agents/skills
skill-cleanup --commands
skill-cleanup --json
skill-cleanup --csv /tmp/skill-cleanup.csv
skill-cleanup --trash --apply
skill-cleanup --apply
```

The first version should behave more like `npkill list results + explicit
delete`, not like a broad system cleaner.

