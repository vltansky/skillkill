import fs from "node:fs";
import path from "node:path";

export function formatTable(rows, limit) {
  const columns = [
    ["skill", 30],
    ["status", 11],
    ["risk", 9],
    ["tokens", 6],
    ["last_strong_read", 19],
    ["last_signal_at", 19],
    ["strong", 6],
    ["weak", 5],
    ["candidate", 9],
    ["reason", 34],
    ["path", 0],
  ];
  const lines = [
    columns.map(([name, width]) => name.padEnd(width || name.length)).join(" | "),
    columns.map(([, width]) => "-".repeat(width || 48)).join("-+-"),
  ];

  for (const row of rows.slice(0, limit)) {
    const values = [
      row.skill,
      row.status,
      row.risk,
      String(row.description_token_cost),
      row.last_strong_read || "-",
      row.last_signal_at || "-",
      String(row.strong_count),
      String(row.weak_path_refs),
      row.cleanup_candidate ? "yes" : "no",
      row.cleanup_reason || "-",
      row.path,
    ];
    lines.push(
      values
        .map((value, index) => {
          const width = columns[index][1];
          if (!width) return value;
          return value.length > width ? `${value.slice(0, width - 1)}.` : value.padEnd(width);
        })
        .join(" | "),
    );
  }

  lines.push(
    "",
    "strong = provider-native skill selection; weak = local path reference in chats/session stores.",
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
