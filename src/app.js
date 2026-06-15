import { parseArgs, printHelp } from "./args.js";
import { buildRows, payloadFor } from "./model.js";
import { collectSkills, scanEvidence } from "./scan.js";
import { formatCommands, formatTable, writeCsv, writeSnapshot } from "./output.js";
import { quarantineCandidates, restoreCleanupRun } from "./quarantine.js";

function write(stream, text) {
  stream.write(text);
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout || process.stdout;
  const now = io.now || new Date();
  const options = parseArgs(argv);

  if (options.help) {
    write(stdout, printHelp());
    return null;
  }

  if (options.undo) {
    const result = restoreCleanupRun(options.stateDir, options.undo);
    write(stdout, `Restored ${result.restored.length} skills from ${result.manifest}.\n`);
    for (const entry of result.restored) {
      write(stdout, `restored ${entry.originalPath}\n`);
    }
    for (const entry of result.skipped) {
      write(stdout, `skipped ${entry.skill}: ${entry.reason}\n`);
    }
    return result;
  }

  const skills = collectSkills(options.skillsDir);
  const scanStats = await scanEvidence(skills, options);
  const rows = buildRows(skills, { ...options, now });
  const payload = payloadFor(rows, options, scanStats, now);

  if (options.csv) writeCsv(options.csv, rows);
  if (options.snapshot) writeSnapshot(options.snapshot, payload, options);

  if (options.apply) {
    const result = quarantineCandidates(rows, { ...options, now });
    if (result.count === 0) {
      write(stdout, "No cleanup candidates.\n");
    } else {
      write(stdout, `Applying cleanup to ${result.count} candidates.\n`);
      write(stdout, `Undo manifest: ${result.manifest}\n`);
      for (const entry of result.entries) {
        write(stdout, `moved ${entry.originalPath} -> ${entry.quarantinedPath}\n`);
      }
      write(stdout, `Undo with: skillkill --undo ${result.manifest}\n`);
    }
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
