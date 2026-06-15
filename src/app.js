import fs from "node:fs";
import { parseArgs, printHelp } from "./args.js";
import { buildRows, payloadFor } from "./model.js";
import { collectSkills, scanEvidence } from "./scan.js";
import { formatCommands, formatTable, writeCsv, writeSnapshot } from "./output.js";

function write(stream, text) {
  stream.write(text);
}

function deleteCandidates(rows, stdout) {
  const candidates = rows.filter((row) => row.cleanup_candidate);
  if (candidates.length === 0) {
    write(stdout, "No cleanup candidates.\n");
    return 0;
  }

  write(stdout, `Applying cleanup to ${candidates.length} candidates.\n`);
  for (const row of candidates) {
    fs.rmSync(row.skill_dir, { recursive: true, force: true });
    write(stdout, `removed ${row.skill_dir}\n`);
  }
  write(stdout, `Deleted ${candidates.length} candidates.\n`);
  return candidates.length;
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout || process.stdout;
  const now = io.now || new Date();
  const options = parseArgs(argv);

  if (options.help) {
    write(stdout, printHelp());
    return null;
  }

  const skills = collectSkills(options.skillsDir);
  const scanStats = await scanEvidence(skills, options);
  const rows = buildRows(skills, { ...options, now });
  const payload = payloadFor(rows, options, scanStats, now);

  if (options.csv) writeCsv(options.csv, rows);
  if (options.snapshot) writeSnapshot(options.snapshot, payload, options);

  if (options.apply) {
    deleteCandidates(rows, stdout);
  } else if (options.commands) {
    write(stdout, formatCommands(rows));
  } else if (options.json) {
    write(stdout, `${JSON.stringify(payload, null, 2)}\n`);
  } else {
    write(stdout, formatTable(rows, options.limit));
    write(
      stdout,
      `\nScanned ${payload.summary.parsedRecords} matching records in ${payload.summary.scanMs}ms (${payload.summary.matchedLines} matching lines).\n`,
    );
  }

  return payload;
}

