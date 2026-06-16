# skillkill

`skillkill` is a local CLI for auditing agent skills and cleaning up stale
or never-used skill directories.

The first design goal is boring safety: the default command opens an
interactive terminal review in a real TTY, cleanup is explicit, and applied
cleanup can be restored from a manifest.

## Docs

- [Plan](docs/plan.md)
- [CLI design](docs/design/skillkill-cli.md)
- [ADR: Build `skillkill` as a terminal-first cleanup CLI](docs/adr/terminal-first-skillkill-cli.md)
- [Research: tools like `npx npkill`](docs/research/npkill-like-tools.md)
- [Research: skill invocation signals](docs/research/skill-invocation-signals.md)

## Intended Command Shape

```bash
npx skillkill
skillkill
skillkill --path ~/.agents/skills
skillkill --source opencode
skillkill --source cursor
skillkill --evidence-dir ~/.continue
skillkill --omit simplify
skillkill --no-interactive
skillkill --commands
skillkill --json
skillkill --csv /tmp/skillkill.csv
skillkill --snapshot ~/.codex/skillkill/snapshots.jsonl
skillkill --apply
skillkill --undo latest
```

Default behavior is interactive when stdin/stdout are terminals. Use arrow keys
or `j`/`k` to move, `space` or `x` to select, `a` to toggle all candidates, `o`
to omit the current skill, and `enter` then `y` to quarantine selected skills.
Interactive omit appends the skill name to `~/.config/skillkill/omit` unless
`--no-omit-file` is set, in which case the omit is only for the current run.

When output is piped, or when `--no-interactive`, `--commands`, `--json`,
`--csv`, or `--snapshot` is used, `skillkill` prints static output instead.
`--apply` moves all candidates into a local quarantine run and writes an undo
manifest. `--undo latest` restores the most recent run.

`skillkill` scans Codex, Claude, OpenCode, and Cursor local stores by default.
Codex injected skill blocks, Claude `attributionSkill` records, and structured
OpenCode `read` tool parts that target `SKILL.md` count as strong evidence.
OpenCode/Cursor path mentions, extra `--evidence-dir` roots, and raw path
mentions count as weak evidence. Recent weak evidence defers cleanup by default
because it may indicate use in a provider without native skill attribution.

## Supported Tools

| Tool | Default locations | Strong evidence | Weak evidence |
| --- | --- | --- | --- |
| Codex | `~/.codex/sessions`, `~/.codex/archived_sessions` | Injected `<skill><name>...<path>...` transcript blocks | Raw `SKILL.md` path references when included in scanned records; broader path discovery with `--full-scan` |
| Claude / Claude Code | `~/.claude/history.jsonl`, `~/.claude/projects`, `~/.claude/tasks`, `~/.claude/sessions`, `~/Library/Application Support/Claude/claude-code-sessions`, `~/Library/Application Support/Claude/local-agent-mode-sessions` | `attributionSkill` records | Raw `.claude/skills/.../SKILL.md` or `.agents/skills/.../SKILL.md` path references |
| OpenCode | `~/.local/share/opencode/storage/message`, `storage/part`, `storage/session/message`, `storage/session/part` | Structured `read` tool parts whose input targets an installed `SKILL.md` | Raw `SKILL.md` path references in message or part JSON |
| Cursor | `~/.cursor/chats/**/store.db` | Not promoted yet; Cursor storage is undocumented and needs a proper SQLite/blob parser first | Raw `SKILL.md` path references found in chat DB blobs |
| Extra filesystem roots | Paths passed with `--evidence-dir` | None | Raw `SKILL.md` path references |

Strong evidence drives `last_strong_read`. Weak evidence drives `last_signal_at`
and protects recent matches from automatic cleanup, but remains lower
confidence.

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
