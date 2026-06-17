# ADR: Classify skill usage evidence by confidence

## Status

Proposed

## Context

`skillkill` recommends cleanup for installed agent skills. A recommendation is
only trustworthy when the scanner distinguishes a real skill invocation from a
looser local reference to the same files.

Local agent tools expose different kinds of records. Some are native
invocation metadata. Some are structured tool calls that read a skill's
`SKILL.md`. Others are raw path mentions in transcripts, SQLite blobs, or
filesystem metadata. Collapsing these into one "last used" timestamp makes the
CLI look more certain than the evidence allows.

The risky failure mode is overclaiming: a raw path mention, `atime`, or
undocumented private-store match could mark a skill as used even though the
agent never selected it. The opposite failure mode also matters: a recent path
mention may indicate activity in a tool without native attribution, so cleanup
should be conservative around recent mentions.

## Decision

Classify local evidence into usage and mention evidence.

Usage evidence includes:

- native skill invocation metadata;
- structured tool/read calls targeting an installed `SKILL.md`;
- captured shell commands that read an installed `SKILL.md` from trusted
  transcripts or explicit evidence files.

Mention evidence includes:

- raw skill name or `SKILL.md` path references;
- filesystem `atime`;
- Cursor chat database blob matches;
- closed or undocumented stores until a stable schema is parsed.

Usage evidence drives `last_used` and verified-use claims. `last_verified_use`
may remain as a compatibility alias for usage-derived timestamps.

Mention evidence drives `last_seen` and `last_any_signal`. Recent mentions may
protect a skill from cleanup, but they must stay labeled as lower confidence
and must not become `last_used`.

Code, tests, docs, and output copy should preserve this distinction. Future
provider support must start as mention-only unless the scanner can identify a
stable native invocation field, structured read call, or trusted shell-read
record.

## Consequences

Positive:

- Cleanup recommendations stay conservative and auditable.
- Human output can explain why a skill was protected without overstating use.
- New providers can be added incrementally without promoting uncertain signals.
- Tests can assert both cleanup safety and evidence provenance.

Negative:

- The scanner has more concepts and more output fields.
- Some tools will show recent activity without verified use until their local
  stores are better understood.
- Provider-specific fixture coverage is required before promoting evidence.

## Alternatives Considered

### Treat any path mention as usage

Rejected. Path mentions can come from search, docs, audits, or unrelated agent
reasoning. They are useful context, but they do not prove invocation.

### Ignore mentions entirely

Rejected. Mentions are a useful safety signal for tools without native
attribution and should protect recent activity from automatic cleanup.

### Use filesystem access time as usage

Rejected. `atime` can be changed by scans, editors, backups, or shell commands.
It is mention-level context at best.

### Promote each provider as soon as paths are found

Rejected. Closed or undocumented stores need stable parsed semantics before
they can affect verified-use fields.
