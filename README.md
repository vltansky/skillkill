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
or `j`/`k` to move, `space` or `x` to select, `a` to toggle all candidates, and
`enter` then `y` to quarantine selected skills.

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
