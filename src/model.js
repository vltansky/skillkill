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
      record.created ??
      record.updated_at ??
      record.updatedAt ??
      record.started_at ??
      record.lastActivityAt ??
      record.time?.updated ??
      record.time?.created ??
      record.state?.time?.end ??
      record.state?.time?.start ??
      record.ts,
  );
}

function latest(items) {
  const dates = items.map((item) => item.ts).filter(Boolean);
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function recent(items, now, days) {
  return items.filter((item) => item.ts && ageDays(item.ts, now) <= days);
}

function estimateDescriptionTokens(description) {
  const text = String(description || "").trim();
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

function statusFor({ cleanupCandidate, dotPrefixed, lastStrong, strongAgeDays, recentWeak, installedAgeDays }, options) {
  if (cleanupCandidate) return "ready";
  if (dotPrefixed) return "protected";
  if (recentWeak) return "weak-signal";
  if (lastStrong && strongAgeDays !== null && strongAgeDays <= options.unusedDays) return "active";
  if (!lastStrong && installedAgeDays !== null && installedAgeDays < options.unusedInstalledDays) {
    return "new";
  }
  return "kept";
}

function riskFor({ cleanupCandidate, cleanupReason, dotPrefixed, recentWeak }) {
  if (dotPrefixed || recentWeak) return "protected";
  if (!cleanupCandidate) return "none";
  if (cleanupReason.startsWith("no strong use")) return "medium";
  return "low";
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
  const protectWeakDays = options.protectWeakDays ?? options.unusedDays;
  const savingsDays = options.savingsDays ?? 30;
  return [...skills.values()]
    .map((usage) => {
      const lastStrong = latest(usage.strong);
      const lastWeak = latest(usage.weak);
      const lastSignal = latest([...usage.strong, ...usage.weak]);
      const recentStrongSignals = recent(usage.strong, now, savingsDays);
      const recentWeakSignals = recent(usage.weak, now, savingsDays);
      const codexStrongCount = usage.strong.filter((item) =>
        item.kind.startsWith("codex_"),
      ).length;
      const claudeStrongCount = usage.strong.filter((item) =>
        item.kind.startsWith("claude_"),
      ).length;
      const opencodeStrongCount = usage.strong.filter((item) =>
        item.kind.startsWith("opencode_"),
      ).length;
      const cursorStrongCount = usage.strong.filter((item) =>
        item.kind.startsWith("cursor_"),
      ).length;
      const filesystemStrongCount = usage.strong.filter((item) =>
        item.kind.startsWith("filesystem_"),
      ).length;
      const opencodeWeakCount = usage.weak.filter((item) =>
        item.kind.startsWith("opencode_"),
      ).length;
      const cursorWeakCount = usage.weak.filter((item) =>
        item.kind.startsWith("cursor_"),
      ).length;
      const filesystemWeakCount = usage.weak.filter((item) =>
        item.kind.startsWith("filesystem_"),
      ).length;
      const strongAgeDays = ageDays(lastStrong, now);
      const weakAgeDays = ageDays(lastWeak, now);
      const signalAgeDays = ageDays(lastSignal, now);
      const installedAt = usage.birthtime || usage.mtime;
      const installedAgeDays = ageDays(installedAt, now);
      const dotPrefixed = usage.skill.startsWith(".");
      const recentWeak =
        lastWeak && weakAgeDays !== null && weakAgeDays <= protectWeakDays;

      let cleanupCandidate = false;
      let cleanupReason = "";
      if (lastStrong && strongAgeDays > options.unusedDays) {
        if (recentWeak) {
          cleanupReason = `recent weak signal ${weakAgeDays} days ago`;
        } else {
          cleanupCandidate = true;
          cleanupReason = `last strong use ${strongAgeDays} days ago`;
        }
      } else if (
        !lastStrong &&
        !dotPrefixed &&
        installedAgeDays !== null &&
        installedAgeDays >= options.unusedInstalledDays
      ) {
        if (recentWeak) {
          cleanupReason = `recent weak signal ${weakAgeDays} days ago`;
        } else {
          cleanupCandidate = true;
          cleanupReason = lastWeak
            ? `no strong use; last weak signal ${weakAgeDays} days ago`
            : `never used; installed ${installedAgeDays} days ago`;
        }
      }

      const row = {
        skill: usage.skill,
        path: usage.path,
        skill_dir: path.dirname(usage.path),
        description: usage.description || "",
        description_token_cost: estimateDescriptionTokens(usage.description),
        strong_count: usage.strong.length,
        codex_strong_count: codexStrongCount,
        claude_strong_count: claudeStrongCount,
        opencode_strong_count: opencodeStrongCount,
        cursor_strong_count: cursorStrongCount,
        filesystem_strong_count: filesystemStrongCount,
        last_strong_read: formatDate(lastStrong),
        strong_age_days: strongAgeDays,
        weak_path_refs: usage.weak.length,
        recent_strong_count: recentStrongSignals.length,
        recent_weak_count: recentWeakSignals.length,
        recent_signal_count: recentStrongSignals.length + recentWeakSignals.length,
        opencode_weak_count: opencodeWeakCount,
        cursor_weak_count: cursorWeakCount,
        filesystem_weak_count: filesystemWeakCount,
        last_path_ref: formatDate(lastWeak),
        weak_age_days: weakAgeDays,
        last_signal_at: formatDate(lastSignal),
        signal_age_days: signalAgeDays,
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
      row.status = statusFor(
        {
          cleanupCandidate,
          dotPrefixed,
          lastStrong,
          strongAgeDays,
          recentWeak,
          installedAgeDays,
        },
        options,
      );
      row.risk = riskFor({
        cleanupCandidate,
        cleanupReason,
        dotPrefixed,
        recentWeak,
      });

      const omitMatch = findOmitMatch(row, options.omitPatterns);
      if (omitMatch) {
        return {
          ...row,
          status: "omitted",
          risk: "protected",
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
  const scanBuckets = Object.values(scanStats).filter(
    (value) => value && typeof value === "object" && "matchedLines" in value,
  );
  return {
    title: "Skill Cleanup",
    generatedAt: now.toISOString(),
    unusedDays: options.unusedDays,
    unusedInstalledDays: options.unusedInstalledDays,
    savingsDays: options.savingsDays ?? 30,
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
      weakOnlyCandidates: candidates.filter((row) =>
        row.cleanup_reason.startsWith("no strong use"),
      ).length,
      recentWeakProtected: rows.filter((row) =>
        row.cleanup_reason.startsWith("recent weak signal"),
      ).length,
      codexStrong: rows.reduce((sum, row) => sum + row.codex_strong_count, 0),
      claudeStrong: rows.reduce((sum, row) => sum + row.claude_strong_count, 0),
      opencodeStrong: rows.reduce((sum, row) => sum + row.opencode_strong_count, 0),
      cursorStrong: rows.reduce((sum, row) => sum + row.cursor_strong_count, 0),
      filesystemStrong: rows.reduce((sum, row) => sum + row.filesystem_strong_count, 0),
      opencodeWeak: rows.reduce((sum, row) => sum + row.opencode_weak_count, 0),
      cursorWeak: rows.reduce((sum, row) => sum + row.cursor_weak_count, 0),
      filesystemWeak: rows.reduce((sum, row) => sum + row.filesystem_weak_count, 0),
      descriptionTokenCost: rows.reduce((sum, row) => sum + row.description_token_cost, 0),
      candidateDescriptionTokenCost: candidates.reduce(
        (sum, row) => sum + row.description_token_cost,
        0,
      ),
      recentActivitySignals: rows.reduce((sum, row) => sum + row.recent_signal_count, 0),
      scanMs: scanStats.elapsedMs,
      matchedLines: scanBuckets.reduce((sum, bucket) => sum + bucket.matchedLines, 0),
      parsedRecords: scanBuckets.reduce((sum, bucket) => sum + bucket.parsedRecords, 0),
    },
    scan: scanStats,
    rows,
  };
}
