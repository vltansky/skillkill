import fs from "node:fs";
import path from "node:path";
import { formatDateMinute, formatDateOnly, formatNumber, hyperlink } from "./format.js";
import { renderLogo } from "./logo.js";

function clipped(value, width) {
  const text = String(value || "");
  if (!width) return text;
  return text.length > width ? `${text.slice(0, width - 1)}.` : text;
}

function cell(text, visibleLength = String(text || "").length) {
  return { text: String(text || ""), visibleLength };
}

function verifiedUseCell(row, width, links) {
  const date = formatDateMinute(row.last_verified_use);
  const title = row.last_verified_chat_title || "";
  if (!title || date === "-") return cell(date, date.length);

  const titleWidth = Math.max(0, width - date.length - 1);
  const label = clipped(title, titleWidth);
  return cell(`${date} ${hyperlink(label, row.last_verified_href, links)}`, date.length + 1 + label.length);
}

function fitCell(value, width) {
  if (!width) return typeof value === "object" ? value.text : String(value);
  if (typeof value === "object") {
    return `${value.text}${" ".repeat(Math.max(0, width - value.visibleLength))}`;
  }
  const text = String(value || "");
  return text.length > width ? `${text.slice(0, width - 1)}.` : text.padEnd(width);
}

export function formatTable(rows, limit, options = {}) {
  const windowDays = options.savingsDays ?? rows[0]?.usage_window_days ?? 30;
  const recentNewChats = options.recentNewChats ?? 0;
  const columns = [
    ["skill", 30],
    ["risk", 9],
    ["tokens", 10],
    [`${windowDays}d burn`, 12],
    ["last_verified_use", 36],
    ["installed date", 14],
    ["last_any_signal", 19],
    ["verified", 8],
    ["mentions", 8],
    ["cleanup?", 8],
    ["cleanup_reason", 34],
    ["path", 0],
  ];
  const lines = [
    renderLogo(),
    "",
    columns.map(([name, width]) => name.padEnd(width || name.length)).join(" | "),
    columns.map(([, width]) => "-".repeat(width || 48)).join("-+-"),
  ];

  for (const row of rows.slice(0, limit)) {
    const values = [
      row.skill,
      row.risk,
      formatNumber(row.description_token_cost),
      formatNumber(row.description_token_cost * recentNewChats),
      verifiedUseCell(row, 36, options.links),
      formatDateOnly(row.installed_at),
      formatDateMinute(row.last_any_signal),
      formatNumber(row.verified_use_count),
      formatNumber(row.path_mention_count),
      row.cleanup_candidate ? "yes" : "no",
      row.cleanup_reason || "-",
      row.path,
    ];
    lines.push(
      values
        .map((value, index) => fitCell(value, columns[index][1]))
        .join(" | "),
    );
  }

  lines.push(
    "",
    "verified use = native skill invocation; path mention = raw SKILL.md path found in local history.",
    "cleanup reason = why the row is selected for cleanup or protected from cleanup.",
    `${windowDays}d burn = description tokens multiplied by ${formatNumber(recentNewChats)} new chats found in the last ${formatNumber(windowDays)} days.`,
  );

  const commands = rows
    .filter((row) => row.cleanup_candidate)
    .slice(0, 10)
    .map((row) => `# ${row.skill}: ${row.cleanup_reason}\n${row.remove_command}`);
  if (commands.length > 0) {
    lines.push("", "Top cleanup commands (dry-run):", commands.join("\n"));
  }
  return `${lines.join("\n")}\n`;
}

export function formatCommands(rows) {
  const candidates = rows.filter((row) => row.cleanup_candidate);
  if (candidates.length === 0) return "No cleanup candidates.\n";
  return `${candidates
    .map((row) => `# ${row.skill}: ${row.cleanup_reason}\n${row.remove_command}`)
    .join("\n")}\n`;
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function writeCsv(file, rows) {
  const fields = Object.keys(rows[0] || { skill: "" });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `${[fields.join(","), ...rows.map((row) => fields.map((field) => csvEscape(row[field])).join(","))].join("\n")}\n`,
  );
}

export function writeSnapshot(file, payload, options) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(
    file,
    `${JSON.stringify({
      timestamp: payload.generatedAt,
      options: {
        source: options.source,
        unusedDays: options.unusedDays,
        unusedInstalledDays: options.unusedInstalledDays,
        savingsDays: options.savingsDays,
      },
      rows: payload.rows,
    })}\n`,
  );
}
