# skillkill Agent Notes

## Project Shape

- `skillkill` is a terminal-first CLI. Do not rebuild an Agents UI or browser review flow unless explicitly requested.
- Keep cleanup scoped to whole installed skill directories. Do not expand this project into a general disk cleaner.
- Old chat history and docs may call this project `skill-cleanup`, `Audit skill usage`, `skill-usage-audit`, or the alias packages `skill-cleanup` / `skill-prune`.

## Evidence Model

- Treat evidence classification as product behavior, not implementation detail.
- Usage evidence: native skill invocation metadata, structured tool/read calls targeting an installed `SKILL.md`, and captured shell commands that read an installed `SKILL.md` from trusted transcripts.
- Mention evidence: raw path/name references, filesystem `atime`, Cursor chat DB blob matches, and closed or undocumented stores without a stable parsed schema.
- Mentions may protect a skill from cleanup, but must not drive `last_used`, `last_verified_use`, or verified-use claims.
- Keep `usage`, `mention`, `last_used`, `last_seen`, and `last_any_signal` semantically separate in code, tests, docs, and output copy.

## CLI Behavior

- Bare `skillkill --undo` and `skillkill undo` open the interactive restore picker.
- `skillkill --undo latest`, `skillkill undo latest`, `--undo RUN_ID`, and `--undo PATH` remain direct/scriptable restore paths.
- Interactive mode only auto-enables when stdin and stdout are terminals and no non-interactive output flag conflicts with it.
- Omit/whitelist patterns are persistent, auditable cleanup exclusions. Preserve omit reasons in machine-readable output.

## Testing And Release Notes

- Evidence changes need fixture tests across agent and mode where relevant: Codex, Claude, Cursor, and OpenCode; indirect invocation, direct `SKILL.md` read, and path-link mention.
- Pathgrade snapshots and agent debug artifacts may only be complete after the agent/process has disposed or exited.
- For publish verification on this machine, prefer GitHub Actions publish logs over local `npm view` when registry configuration is suspicious.
- The default branch is `main`.
