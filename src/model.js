import path from "node:path";
import { shellQuote } from "./fs-utils.js";
import { findOmitMatch } from "./omit.js";

export function parseTimestamp(value) {
  if (!value) return null;
  if (typeof value === "number") {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== "string") return null;

  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;

  const match = value.match(
    /(?<y>\d{4})-(?<m>\d{2})-(?<d>\d{2})[ T](?<hh>\d{2}):(?<mm>\d{2}):(?<ss>\d{2})/,
  );
  if (!match) return null;
  return new Date(
    Date.UTC(
      Number(match.groups.y),
      Number(match.groups.m) - 1,
      Number(match.groups.d),
      Number(match.groups.hh),
      Number(match.groups.mm),
      Number(match.groups.ss),
    ),
  );
}

export function timestampFromRecord(record) {
  return parseTimestamp(
    record.timestamp ??
      record.created_at ??
      record.createdAt ??
      record.started_at ??
      record.ts,
  );
}

function latest(items) {
  const dates = items.map((item) => item.ts).filter(Boolean);
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

export function formatDate(value) {
  if (!value) return "";
  return value.toISOString().replace("T", " ").slice(0, 19);
}

export function ageDays(value, now = new Date()) {
  if (!value) return null;
  return Math.max(0, Math.floor((now.getTime() - value.getTime()) / 86_400_000));
}

export function buildRows(skills, options) {
  const now = options.now || new Date();
  return [...skills.values()]
    .map((usage) => {
      const lastStrong = latest(usage.strong);
      const lastWeak = latest(usage.weak);
      const codexStrongCount = usage.strong.filter((item) =>
        item.kind.startsWith("codex_"),
      ).length;
      const claudeStrongCount = usage.strong.filter((item) =>
        item.kind.startsWith("claude_"),
      ).length;
      const strongAgeDays = ageDays(lastStrong, now);
      const installedAt = usage.birthtime || usage.mtime;
      const installedAgeDays = ageDays(installedAt, now);
      const dotPrefixed = usage.skill.startsWith(".");

      let cleanupCandidate = false;
      let cleanupReason = "";
      if (lastStrong && strongAgeDays > options.unusedDays) {
        cleanupCandidate = true;
        cleanupReason = `last strong use ${strongAgeDays} days ago`;
      } else if (
        !lastStrong &&
        !dotPrefixed &&
        installedAgeDays !== null &&
        installedAgeDays >= options.unusedInstalledDays
      ) {
        cleanupCandidate = true;
        cleanupReason = `never used; installed ${installedAgeDays} days ago`;
      }

      const row = {
        skill: usage.skill,
        path: usage.path,
        skill_dir: path.dirname(usage.path),
        strong_count: usage.strong.length,
        codex_strong_count: codexStrongCount,
        claude_strong_count: claudeStrongCount,
        last_strong_read: formatDate(lastStrong),
        strong_age_days: strongAgeDays,
        weak_path_refs: usage.weak.length,
        last_path_ref: formatDate(lastWeak),
        atime: formatDate(usage.atime),
        atime_age_days: ageDays(usage.atime, now),
        installed_at: formatDate(installedAt),
        installed_age_days: installedAgeDays,
        mtime: formatDate(usage.mtime),
        mtime_age_days: ageDays(usage.mtime, now),
        cleanup_candidate: cleanupCandidate,
        cleanup_reason: cleanupReason,
        remove_command: `rm -rf ${shellQuote(path.dirname(usage.path))}`,
      };

      const omitMatch = findOmitMatch(row, options.omitPatterns);
      if (omitMatch) {
        return {
          ...row,
          omitted: true,
          omit_pattern: omitMatch.pattern,
          omit_source: omitMatch.source,
          original_cleanup_candidate: cleanupCandidate,
          original_cleanup_reason: cleanupReason,
          cleanup_candidate: false,
          cleanup_reason: `omitted by whitelist: ${omitMatch.pattern}`,
        };
      }

      return {
        ...row,
        omitted: false,
        omit_pattern: "",
        omit_source: "",
        original_cleanup_candidate: cleanupCandidate,
        original_cleanup_reason: cleanupReason,
      };
    })
    .sort((a, b) => {
      if (a.cleanup_candidate !== b.cleanup_candidate) {
        return a.cleanup_candidate ? -1 : 1;
      }
      if (a.last_strong_read && b.last_strong_read) {
        return b.last_strong_read.localeCompare(a.last_strong_read);
      }
      if (a.last_strong_read) return -1;
      if (b.last_strong_read) return 1;
      return a.skill.localeCompare(b.skill);
    });
}

export function payloadFor(rows, options, scanStats, now = new Date()) {
  const candidates = rows.filter((row) => row.cleanup_candidate);
  const omitted = rows.filter((row) => row.omitted);
  return {
    title: "Skill Cleanup",
    generatedAt: now.toISOString(),
    unusedDays: options.unusedDays,
    unusedInstalledDays: options.unusedInstalledDays,
    source: options.source,
    summary: {
      total: rows.length,
      candidates: candidates.length,
      omitted: omitted.length,
      staleCandidates: candidates.filter((row) =>
        row.cleanup_reason.startsWith("last strong use"),
      ).length,
      neverUsedCandidates: candidates.filter((row) =>
        row.cleanup_reason.startsWith("never used"),
      ).length,
      codexStrong: rows.reduce((sum, row) => sum + row.codex_strong_count, 0),
      claudeStrong: rows.reduce((sum, row) => sum + row.claude_strong_count, 0),
      scanMs: scanStats.elapsedMs,
      matchedLines: scanStats.codex.matchedLines + scanStats.claude.matchedLines,
      parsedRecords:
        scanStats.codex.parsedRecords + scanStats.claude.parsedRecords,
    },
    scan: scanStats,
    rows,
  };
}
