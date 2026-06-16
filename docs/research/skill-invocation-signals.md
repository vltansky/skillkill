# Skill Invocation Signal Research

## Summary

Agent tools expose different confidence levels for skill usage:

- Native invocation metadata is strongest.
- Structured tool calls that read an installed `SKILL.md` are also strong.
- Raw path mentions in chat/session stores are weak, but useful for avoiding
  risky cleanup.
- Closed or undocumented stores should stay weak unless parsed with a stable
  schema.

## Evidence

- Codex rollout traces model conversation items and runtime `tool_calls`, but
  local transcript skill blocks remain the direct skill-selection signal for
  installed skills:
  https://github.com/openai/codex/blob/main/codex-rs/rollout-trace/README.md#L46-L86
- OpenCode defines `ToolPart` records with `type: "tool"`, `callID`, `tool`,
  and `state`, so a `read` tool part targeting `SKILL.md` is stronger than a
  raw path mention:
  https://github.com/anomalyco/opencode/blob/dev/packages/core/src/v1/session.ts#L281-L351
- OpenCode persists part rows separately from message rows with `time_created`,
  so scanners should include part stores, not only message stores:
  https://github.com/anomalyco/opencode/blob/dev/packages/core/src/session/projector.ts#L297-L347
- Continue persists tool calls as function names plus serialized arguments in
  chat history:
  https://github.com/continuedev/continue/blob/main/extensions/cli/src/services/ChatHistoryService.ts#L145-L215
- Continue's shared `ToolCall` type keeps function name and arguments, which is
  enough to identify read calls when history is available:
  https://github.com/continuedev/continue/blob/main/core/index.d.ts#L331-L381
- Cline conversation history includes explicit `tool_use` blocks with the tool
  name and JSON input:
  https://github.com/cline/cline/blob/main/apps/vscode/src/core/storage/disk.ts#L757-L807
- Cursor `store.db` is undocumented, but independent parsers recover structured
  `tool-call` records from JSON blobs; byte-grep should remain weak until
  `skillkill` has a real DB/blob parser:
  https://github.com/redaphid/mind-meld/blob/main/src/parsers/cursor-blobs.ts#L73-L150

## Implications

- Keep Codex skill blocks and Claude `attributionSkill` as strong.
- Treat OpenCode `read` tool parts for `SKILL.md` as strong.
- Keep OpenCode/Cursor raw path matches as weak.
- Add future structured parsers for Continue, Cline/Roo, and Cursor before
  promoting their evidence.
