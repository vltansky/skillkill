# skillkill

Audit local agent skills, find stale or never-used installs, and clean them up
through an undoable quarantine.

The design goal is boring safety: preview first, explicit cleanup, and a restore
path if something was moved by mistake.

## Quick Start

Run without installing:

```bash
npx skillkill
```

Or install globally:

```bash
npm install --global skillkill
skillkill
```

In a real terminal, `skillkill` opens an interactive review. When output is
piped, or when `--no-interactive`, `--json`, `--csv`, or `--snapshot` is used,
it prints static output instead.

## What It Does

`skillkill` scans installed skill directories, then checks local agent history
for evidence that each skill was actually used.

- Default skill roots: `~/.agents/skills`, `~/.claude/skills`,
  `~/.codex/skills`, and `~/.cursor/skills`
- Verified use: native skill-invocation records from supported tools
- Path mention: raw `SKILL.md` path mentions in supported local stores
- Cleanup candidates: stale verified use or never-used skills past the age
  threshold
- Protected rows: dot-prefixed system skills, recent verified use, recent path
  mentions, and omitted skills

Path mentions do not prove a skill was invoked, but recent path mentions keep a
skill out of cleanup candidates because they may indicate use in tools without
native attribution.

## Safety Model

- Default runs do not move files.
- Interactive cleanup requires selecting rows, pressing `enter` to review, then
  pressing `enter` again to move them to quarantine.
- `--apply` moves candidates into `~/.local/state/skillkill/runs/...`; it does
  not permanently delete them.
- If a quarantined skill is tracked by `npx skills`, matching Vercel lock
  entries are removed from `~/.agents/.skill-lock.json`,
  `$XDG_STATE_HOME/skills/.skill-lock.json`, or an existing project
  `skills-lock.json`, then saved in the undo manifest.
- `skillkill --undo` or `skillkill undo` opens an interactive restore picker.
- `skillkill --undo latest`, `skillkill undo latest`, `--undo RUN_ID`, and
  `--undo PATH` restore directly for scripts, including any Vercel lock entries
  saved by cleanup.
- `--omit`, `--whitelist`, and `~/.config/skillkill/omit` keep known-good skills
  out of cleanup candidates.
- Symlinked skill installs are treated as installs. Cleanup moves the symlink
  into quarantine, not the symlink target.

## Docs

- [Plan](docs/plan.md)
- [CLI design](docs/design/skillkill-cli.md)
- [ADR: Build `skillkill` as a terminal-first cleanup CLI](docs/adr/terminal-first-skillkill-cli.md)
- [Research: tools like `npx npkill`](docs/research/npkill-like-tools.md)
- [Research: skill invocation signals](docs/research/skill-invocation-signals.md)

## Usage

```bash
# Interactive review
npx skillkill
skillkill

# Scan different skill roots or evidence sources
skillkill --path ~/.agents/skills
skillkill --path ~/.agents/skills --path ~/.claude/skills
skillkill --source opencode
skillkill --source cursor
skillkill --evidence-dir ~/.continue

# Keep known-good skills out of cleanup candidates
skillkill --omit simplify
skillkill --omit "ck-*"
skillkill omit simplify

# Static output for scripts and review artifacts
skillkill list --json
skillkill --no-interactive
skillkill --commands
skillkill --json
skillkill --csv /tmp/skillkill.csv
skillkill --snapshot ~/.codex/skillkill/snapshots.jsonl

# Cleanup and restore
skillkill cleanup --apply
skillkill --apply
skillkill --undo
skillkill --undo latest
skillkill undo latest
```

Rows include `risk`, `description_token_cost`, and `used_14d_tokens`. Token cost
is a rough estimate from the skill `description` frontmatter field.
`used_14d_tokens` multiplies that cost by verified uses in the last 14 days.

The interactive confirmation screen shows the selected skills, description
tokens removed, and an estimated repeated prompt saving. That estimate multiplies
removed description tokens by recent skill activity signals/sessions from the
last `--savings-days` window.

## Interactive Keys

| Key | Action |
| --- | --- |
| `up` / `down` or `j` / `k` | Move through rows |
| `/` | Search visible cleanup candidates |
| `space` or `x` | Select or unselect the current skill |
| `a` | Toggle all cleanup candidates |
| `o` | Omit the current skill |
| `enter` | Open review, keep search, or confirm cleanup/restore |
| `y` | Confirm cleanup or restore shortcut |
| `n` / `esc` | Cancel confirmation |
| `q` | Quit |

Interactive omit appends the skill name to `~/.config/skillkill/omit` unless
`--no-omit-file` is set, in which case the omit lasts only for the current run.

## Core Options

| Option | Purpose |
| --- | --- |
| `--path PATH`, `--skills-dir PATH` | Skills directory to scan; repeatable |
| `--source codex|claude|opencode|cursor|filesystem|all` | Evidence source to scan |
| `--evidence-dir PATH` | Extra transcript or log directory for path mentions |
| `--unused-days N` | Mark skills stale after last verified use |
| `--unused-installed-days N` | Propose never-used skills after install age |
| `--protect-weak-days N` | Defer cleanup after recent path mentions |
| `--savings-days N` | Estimate token savings from recent activity |
| `--omit PATTERN`, `--whitelist PATTERN` | Keep matching skills out of cleanup candidates |
| `skillkill omit PATTERN` | Persist an omit pattern |
| `--no-interactive` | Print the static table |
| `--json`, `--csv PATH`, `--snapshot PATH` | Machine-readable or persistent outputs |
| `cleanup --apply`, `--apply` | Move cleanup candidates to quarantine |
| `undo [latest|RUN_ID|PATH]`, `--undo [latest|RUN_ID|PATH]` | Restore a quarantine run |
| `--full-scan` | Parse every JSONL line instead of prefiltering |

Run `skillkill --help` for the complete command reference.

## Supported Tools

| Tool | Default locations | Verified use | Path mentions |
| --- | --- | --- | --- |
| Codex | `~/.codex/sessions`, `~/.codex/archived_sessions` | Injected `<skill><name>...<path>...` transcript blocks | Raw `SKILL.md` path references when included in scanned records; broader path discovery with `--full-scan` |
| Claude / Claude Code | `~/.claude/history.jsonl`, `~/.claude/projects`, `~/.claude/tasks`, `~/.claude/sessions`, `~/Library/Application Support/Claude/claude-code-sessions`, `~/Library/Application Support/Claude/local-agent-mode-sessions` | `attributionSkill` records | Raw `.claude/skills/.../SKILL.md` or `.agents/skills/.../SKILL.md` path references |
| OpenCode | `~/.local/share/opencode/storage/message`, `storage/part`, `storage/session/message`, `storage/session/part` | Structured `read` tool parts whose input targets an installed `SKILL.md` | Raw `SKILL.md` path references in message or part JSON |
| Cursor | `~/.cursor/chats/**/store.db` | Not promoted yet; Cursor storage is undocumented and needs a proper SQLite/blob parser first | Raw `SKILL.md` path references found in chat DB blobs |
| Extra filesystem roots | Paths passed with `--evidence-dir` | None | Raw `SKILL.md` path references |

Verified use drives `last_verified_use`. Path mentions contribute to
`last_any_signal` and protect recent matches from automatic cleanup, but remain
lower confidence.

## Whitelist / Omit

Use `--omit` to keep a skill out of cleanup candidates:

```bash
skillkill --omit simplify
skillkill --omit "ck-*"
skillkill --whitelist simplify
```

For persistent omissions, add one skill name or glob per line:

```text
~/.config/skillkill/omit
```

Blank lines and `#` comments are ignored. Omit patterns match skill names,
`SKILL.md` paths, and skill directory paths.

Published alias packages delegate to the same CLI:

```bash
npx skill-cleanup
npx skill-prune
```

Installing `skillkill` also exposes `skill-kill` as a local/global command
alias. npm blocks `skill-kill` as a separate package name because it is too
similar to `skillkill`.

## Development

```bash
npm test
npm run check
npm run build
```

Local command link:

```bash
mkdir -p "$HOME/.local/bin"
ln -sf "$PWD/bin/skillkill.js" "$HOME/.local/bin/skillkill"
```

## Publishing

Publishing is done only by GitHub Actions. The publish workflow supports a
manual dry run and publishes `skillkill`, `skill-cleanup`, and `skill-prune`
from version tags.
