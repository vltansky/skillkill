# ADR: Group duplicate skill installs only when equivalent

## Status

Proposed

## Context

`skillkill` scans several local install roots, including `.agents`, `.claude`,
`.codex`, and `.cursor`. The same skill name can appear in more than one root.

Showing every duplicate name separately creates review noise when those installs
are just multiple pointers to the same skill. This is common when installs are
symlinked into several agent-specific roots, or when the same skill directory was
copied without modification.

The opposite case also matters: two installs can share a skill name while having
different local content. That can happen after manual edits, stale package
installs, experiments, or divergent agent-specific copies. Collapsing those rows
would hide useful cleanup context and make one selection apply to installs that
are not actually interchangeable.

## Decision

Group duplicate installed skills only when they are equivalent.

Two rows are equivalent when they have the same skill name and either:

- their skill directories have the same content fingerprint, or
- fingerprinting is unavailable and both symlinks point at the same resolved
  target.

The fingerprint is calculated from the skill directory's relative file paths and
file bytes. Metadata such as mtime, atime, birthtime, install root, and symlink
path does not affect equivalence.

Grouped rows keep all concrete install paths on the row. Review output shows the
install count, dry-run commands expand to every concrete path, and cleanup still
quarantines or deletes each install entry separately. For symlink installs,
cleanup removes the symlink entries and preserves the shared target.

If two installs have the same skill name but different directory fingerprints,
show them as separate rows.

## Consequences

Positive:

- The review table is quieter for true duplicates.
- Users do not need to make the same cleanup decision several times for
  identical installs.
- Divergent same-name installs remain visible and reviewable.
- Cleanup manifests stay exact because they record one entry per physical
  install path.

Negative:

- Scanning does a little more filesystem work because each skill directory is
  fingerprinted.
- A grouped row can represent several install roots, so table output must be
  explicit about the install count.
- Byte-for-byte equality is conservative; semantically equivalent skills with
  harmless file differences are still shown separately.

## Alternatives Considered

### Group by skill name only

Rejected. Same-name installs can diverge, and hiding that divergence would make
cleanup decisions less trustworthy.

### Always show every install

Rejected. This preserves maximum detail, but creates avoidable noise for
symlinked or copied installs that are functionally the same cleanup decision.

### Group symlinks only

Rejected. It misses byte-for-byte identical copied installs, which create the
same review noise as symlink duplicates.

### Group by parsed metadata only

Rejected. Matching `name` and `description` is not enough to prove that the
skill implementation and instructions are identical.
