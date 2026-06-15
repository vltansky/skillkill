# skill-cleanup

`skill-cleanup` is a local CLI for auditing agent skills and cleaning up stale
or never-used skill directories.

The first design goal is boring safety: the default command reports candidates
only, cleanup requires an explicit apply flag, and applied cleanup can be
restored from a manifest.

## Docs

- [Plan](docs/plan.md)
- [CLI design](docs/design/skill-cleanup-cli.md)
- [ADR: Build `skill-cleanup` as a terminal-first cleanup CLI](docs/adr/terminal-first-skill-cleanup-cli.md)
- [Research: tools like `npx npkill`](docs/research/npkill-like-tools.md)

## Intended Command Shape

```bash
skill-cleanup
skill-cleanup --path ~/.agents/skills
skill-cleanup --commands
skill-cleanup --json
skill-cleanup --csv /tmp/skill-cleanup.csv
skill-cleanup --snapshot ~/.codex/skill-cleanup/snapshots.jsonl
skill-cleanup --apply
skill-cleanup --undo latest
```

Default behavior is dry-run. `--apply` moves candidates into a local quarantine
run and writes an undo manifest. `--undo latest` restores the most recent run.

## Development

```bash
npm test
npm run check
```

Local command link:

```bash
mkdir -p "$HOME/.local/bin"
ln -sf "$PWD/bin/skill-cleanup.js" "$HOME/.local/bin/skill-cleanup"
```
