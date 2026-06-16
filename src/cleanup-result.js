import { colors, shouldUseColor } from "./ansi.js";
import { formatNumber } from "./format.js";

function plural(count, one, many = `${one}s`) {
  return count === 1 ? one : many;
}

function cleanupSummary(entries, savingsDays) {
  const removedTokens = entries.reduce((sum, entry) => sum + (entry.descriptionTokenCost || 0), 0);
  return {
    removedTokens,
    recentVerifiedUses: entries.reduce((sum, entry) => sum + (entry.recentStrongCount || 0), 0),
    recentPathMentions: entries.reduce((sum, entry) => sum + (entry.recentWeakCount || 0), 0),
    observedUseTokens: entries.reduce(
      (sum, entry) => sum + (entry.descriptionTokenCost || 0) * (entry.recentStrongCount || 0),
      0,
    ),
    savingsDays,
  };
}

export function formatCleanupResult(result, options = {}) {
  const color = colors(
    options.colors ?? shouldUseColor(options.stdout || process.stdout),
  );
  if (result.count === 0) {
    return `${color.good("No cleanup candidates.")}\n`;
  }

  const permanent = result.mode === "delete";
  const action = permanent ? "permanently deleted" : "quarantined";
  const title = `${action[0].toUpperCase()}${action.slice(1)} ${formatNumber(result.count)} ${plural(result.count, "skill")}`;
  const savingsDays = result.savingsDays ?? options.savingsDays ?? 30;
  const recentNewChats = result.recentNewChats ?? options.recentNewChats ?? 0;
  const summary = cleanupSummary(result.entries || [], savingsDays);
  const potentialNewChatSavings = summary.removedTokens * recentNewChats;
  const lines = [
    color.good(`Done: ${title}`),
    "",
    color.header("Token savings"),
    `  Saved per skill-catalog load: ${color.token(formatNumber(summary.removedTokens))} description tokens`,
    `  Potential new-chat savings: ${color.token(formatNumber(summary.removedTokens))} x ${color.info(formatNumber(recentNewChats))} new ${plural(recentNewChats, "chat")} in last ${formatNumber(summary.savingsDays)} days = ${color.good(formatNumber(potentialNewChatSavings))} tokens`,
    `  Selected verified uses in last ${formatNumber(summary.savingsDays)} days: ${color.info(formatNumber(summary.recentVerifiedUses))}`,
    `  Observed selected-use prompt cost removed: ${color.token(formatNumber(summary.observedUseTokens))} tokens`,
  ];

  if (summary.recentPathMentions > 0) {
    lines.push(`  Path mentions in window: ${color.dim(formatNumber(summary.recentPathMentions))} (not counted as verified use)`);
  }

  lines.push("", color.header(permanent ? "Deleted paths" : "Moved paths"));
  for (const entry of result.entries || []) {
    lines.push(`  - ${color.good(entry.skill)}`);
    lines.push(`    from: ${color.dim(entry.originalPath)}`);
    if (permanent) {
      lines.push(`    deleted: ${color.dim(entry.deletedPath || entry.originalPath)}`);
    } else {
      lines.push(`    to: ${color.dim(entry.quarantinedPath)}`);
    }
  }

  if (result.vercelLocks?.removed?.length) {
    lines.push("", color.header("Vercel skills lock"));
    lines.push(`  Removed ${color.warn(formatNumber(result.vercelLocks.removed.length))} entries.`);
  }
  for (const error of result.vercelLocks?.errors || []) {
    lines.push(`  ${color.warn(`Could not update ${error.lockPath}: ${error.error}`)}`);
  }

  lines.push("", color.header(permanent ? "Undo" : "Restore"));
  if (permanent) {
    lines.push(color.danger("  Permanent delete does not write an undo manifest."));
  } else {
    lines.push(`  Manifest: ${color.dim(result.manifest)}`);
    lines.push(`  Command: ${color.info(`skillkill --undo ${result.manifest}`)}`);
  }

  return `${lines.join("\n")}\n`;
}
