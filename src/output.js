import fs from "node:fs";
import path from "node:path";

export function formatTable(rows, limit) {
  const columns = [
    ["skill", 30],
    ["risk", 9],
    ["tokens", 6],
    ["used_14d_tokens", 15],
    ["last_verified_use", 19],
    ["last_any_signal", 19],
    ["verified", 8],
    ["mentions", 8],
    ["cleanup?", 8],
    ["cleanup_reason", 34],
    ["path", 0],
  ];
  const lines = [
    columns.map(([name, width]) => name.padEnd(width || name.length)).join(" | "),
    columns.map(([, width]) => "-".repeat(width || 48)).join("-+-"),
  ];

  for (const row of rows.slice(0, limit)) {
    const values = [
      row.skill,
      row.risk,
      String(row.description_token_cost),
      String(row.used_14d_tokens),
      row.last_verified_use || "-",
      row.last_any_signal || "-",
      String(row.verified_use_count),
      String(row.path_mention_count),
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
    "verified use = native skill invocation; path mention = raw SKILL.md path found in local history.",
    "cleanup reason = why the row is selected for cleanup or protected from cleanup.",
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
