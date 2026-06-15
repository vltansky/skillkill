# skillkill

`skillkill` is a local CLI for auditing agent skills and cleaning up stale
or never-used skill directories.

The first design goal is boring safety: the default command reports candidates
only, cleanup requires an explicit apply flag, and applied cleanup can be
restored from a manifest.

## Docs

- [Plan](docs/plan.md)
- [CLI design](docs/design/skillkill-cli.md)
- [ADR: Build `skillkill` as a terminal-first cleanup CLI](docs/adr/terminal-first-skillkill-cli.md)
- [Research: tools like `npx npkill`](docs/research/npkill-like-tools.md)

## Intended Command Shape

```bash
npx skillkill
skillkill
skillkill --path ~/.agents/skills
skillkill --commands
skillkill --json
skillkill --csv /tmp/skillkill.csv
skillkill --snapshot ~/.codex/skillkill/snapshots.jsonl
skillkill --apply
skillkill --undo latest
```

Default behavior is dry-run. `--apply` moves candidates into a local quarantine
run and writes an undo manifest. `--undo latest` restores the most recent run.

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
