# skill-cleanup

`skill-cleanup` is a local CLI for auditing agent skills and cleaning up stale
or never-used skill directories.

The first design goal is boring safety: the default command reports candidates
only, deletion requires an explicit apply flag, and evidence must come from
agent transcripts rather than filesystem access time.

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
```

Default behavior is dry-run. `--apply` is the destructive mode.

## Development

```bash
npm test
npm run check
```

Local command link:

```bash
ln -sf $HOME/projects/skill-cleanup/bin/skill-cleanup.js $HOME/.local/bin/skill-cleanup
```
