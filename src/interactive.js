import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { quarantineCandidates } from "./quarantine.js";

function write(stream, text) {
  stream.write(text);
}

function clip(value, width) {
  const text = String(value || "");
  if (width <= 1) return text.slice(0, Math.max(0, width));
  return text.length > width ? `${text.slice(0, width - 1)}.` : text.padEnd(width);
}

function candidateRows(rows, state = {}) {
  const omitted = state.omitted || new Set();
  return rows.filter((row) => row.cleanup_candidate && !omitted.has(row.skill));
}

function appendOmitPattern(options, pattern) {
  if (options.noOmitFile || !options.omitFile) return false;

  let existing = "";
  try {
    existing = fs.existsSync(options.omitFile) ? fs.readFileSync(options.omitFile, "utf8") : "";
  } catch {
    existing = "";
  }

  const alreadyPresent = existing
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line === pattern);
  if (alreadyPresent) return true;

  fs.mkdirSync(path.dirname(options.omitFile), { recursive: true });
  const needsLeadingNewline = existing.length > 0 && !existing.endsWith("\n");
  fs.appendFileSync(options.omitFile, `${needsLeadingNewline ? "\n" : ""}${pattern}\n`);
  return true;
}

export function shouldRunInteractive(options, io = {}) {
  if (options.noInteractive || options.apply || options.commands || options.json || options.undo) {
    return false;
  }
  if (options.interactive) return true;

  const stdin = io.stdin || process.stdin;
  const stdout = io.stdout || process.stdout;
  return Boolean(stdin.isTTY && stdout.isTTY && !options.csv && !options.snapshot);
}

export function renderInteractiveScreen(rows, state = {}, dimensions = {}) {
  const candidates = candidateRows(rows, state);
  const total = rows.length;
  const hidden = Math.max(0, total - candidates.length);
  const selected = state.selected || new Set();
  const omitted = state.omitted || new Set();
  const cursor = Math.min(Math.max(0, state.cursor || 0), Math.max(0, candidates.length - 1));
  const height = Math.max(10, dimensions.rows || 24);
  const width = Math.max(72, dimensions.columns || 100);
  const visible = Math.max(3, height - 9);
  const start = Math.min(
    Math.max(0, cursor - Math.floor(visible / 2)),
    Math.max(0, candidates.length - visible),
  );
  const end = Math.min(candidates.length, start + visible);
  const nameWidth = Math.min(30, Math.max(18, Math.floor(width * 0.24)));
  const reasonWidth = Math.min(38, Math.max(20, Math.floor(width * 0.32)));
  const dateWidth = 19;
  const pathWidth = Math.max(14, width - nameWidth - reasonWidth - dateWidth - 16);

  const lines = [
    "skillkill interactive cleanup",
    `${candidates.length} cleanup candidates, ${selected.size} selected${omitted.size ? `, ${omitted.size} omitted this run` : ""}${hidden ? `, ${hidden} hidden as protected/recent/omitted` : ""}`,
    "",
    `   sel ${clip("skill", nameWidth)} ${clip("reason", reasonWidth)} ${clip("last strong use", dateWidth)} ${clip("path", pathWidth)}`,
    `   --- ${"-".repeat(nameWidth)} ${"-".repeat(reasonWidth)} ${"-".repeat(dateWidth)} ${"-".repeat(pathWidth)}`,
  ];

  if (candidates.length === 0) {
    lines.push("", "No cleanup candidates.");
  } else {
    for (let index = start; index < end; index += 1) {
      const row = candidates[index];
      const active = index === cursor ? ">" : " ";
      const mark = selected.has(row.skill) ? "[x]" : "[ ]";
      lines.push(
        `${active} ${mark} ${clip(row.skill, nameWidth)} ${clip(row.cleanup_reason, reasonWidth)} ${clip(row.last_strong_read || "-", dateWidth)} ${clip(row.path, pathWidth)}`,
      );
    }
  }

  if (state.confirming) {
    lines.push(
      "",
      `Quarantine ${selected.size} selected skills? Press y to confirm, n to cancel.`,
    );
  } else if (state.message) {
    lines.push("", state.message);
  } else {
    lines.push("");
  }

  lines.push("Keys: up/down or j/k move, space/x select, a all, o omit, enter quarantine, q quit");
  lines.push("Use --no-interactive for the static table. Cleanup is quarantine-only and undoable.");
  return `${lines.join("\n")}\n`;
}

function render(stdout, rows, state) {
  write(stdout, "\x1b[2J\x1b[H");
  write(
    stdout,
    renderInteractiveScreen(rows, state, {
      columns: stdout.columns,
      rows: stdout.rows,
    }),
  );
}

function printResult(stdout, result) {
  if (result.count === 0) {
    write(stdout, "No selected cleanup candidates.\n");
    return;
  }
  write(stdout, `Quarantined ${result.count} skills.\n`);
  write(stdout, `Undo manifest: ${result.manifest}\n`);
  for (const entry of result.entries) {
    write(stdout, `moved ${entry.originalPath} -> ${entry.quarantinedPath}\n`);
  }
  write(stdout, `Undo with: skillkill --undo ${result.manifest}\n`);
}

export async function runInteractive(rows, payload, options, io = {}) {
  const stdin = io.stdin || process.stdin;
  const stdout = io.stdout || process.stdout;

  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== "function") {
    if (options.interactive) {
      throw new Error("Interactive mode requires a TTY. Use --no-interactive for static output.");
    }
    return null;
  }

  if (candidateRows(rows).length === 0) {
    write(stdout, "No cleanup candidates.\n");
    return { payload, interactive: true, cleanup: { count: 0, manifest: "", entries: [] } };
  }

  const state = {
    cursor: 0,
    selected: new Set(),
    omitted: new Set(),
    confirming: false,
    message: "",
  };
  const wasRaw = stdin.isRaw;

  readline.emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  write(stdout, "\x1b[?25l");
  render(stdout, rows, state);

  return new Promise((resolve, reject) => {
    let finished = false;

    function cleanup({ clear = true } = {}) {
      stdin.off("keypress", onKeypress);
      stdin.setRawMode(Boolean(wasRaw));
      stdin.pause();
      write(stdout, "\x1b[?25h");
      if (clear) write(stdout, "\x1b[2J\x1b[H");
    }

    function finish(value) {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(value);
    }

    function fail(error) {
      if (finished) return;
      finished = true;
      cleanup();
      reject(error);
    }

    function selectedRows() {
      return candidateRows(rows, state).filter((row) => state.selected.has(row.skill));
    }

    function toggleCurrent() {
      const row = candidateRows(rows, state)[state.cursor];
      if (!row) return;
      if (state.selected.has(row.skill)) {
        state.selected.delete(row.skill);
      } else {
        state.selected.add(row.skill);
      }
      state.message = "";
    }

    function toggleAll() {
      const candidates = candidateRows(rows, state);
      if (state.selected.size === candidates.length) {
        state.selected.clear();
      } else {
        for (const row of candidates) state.selected.add(row.skill);
      }
      state.message = "";
    }

    function move(delta) {
      const candidates = candidateRows(rows, state);
      state.cursor = Math.min(Math.max(0, state.cursor + delta), candidates.length - 1);
      state.message = "";
    }

    function omitCurrent() {
      const candidates = candidateRows(rows, state);
      const row = candidates[state.cursor];
      if (!row) return;
      state.omitted.add(row.skill);
      state.selected.delete(row.skill);
      const saved = appendOmitPattern(options, row.skill);
      state.cursor = Math.min(state.cursor, Math.max(0, candidateRows(rows, state).length - 1));
      state.message = saved
        ? `Omitted ${row.skill} and saved to ${options.omitFile}.`
        : `Omitted ${row.skill} for this run.`;
    }

    function applySelected() {
      const picked = selectedRows();
      const result = quarantineCandidates(picked, options);
      finished = true;
      cleanup();
      printResult(stdout, result);
      resolve({ payload, interactive: true, cleanup: result });
    }

    function onKeypress(_str, key = {}) {
      try {
        if (key.ctrl && key.name === "c") {
          finish({ payload, interactive: true, cancelled: true });
          return;
        }

        if (state.confirming) {
          if (key.name === "y") {
            applySelected();
            return;
          }
          if (key.name === "n" || key.name === "escape" || key.name === "q") {
            state.confirming = false;
            state.message = "Cancelled.";
            render(stdout, rows, state);
            return;
          }
          render(stdout, rows, state);
          return;
        }

        if (key.name === "q" || key.name === "escape") {
          finish({ payload, interactive: true, cancelled: true });
          return;
        }
        if (key.name === "up" || key.name === "k") move(-1);
        else if (key.name === "down" || key.name === "j") move(1);
        else if (key.name === "space" || key.name === "x") toggleCurrent();
        else if (key.name === "a") toggleAll();
        else if (key.name === "o") omitCurrent();
        else if (key.name === "return" || key.name === "enter") {
          if (state.selected.size === 0) {
            state.message = "Select at least one skill first.";
          } else {
            state.confirming = true;
            state.message = "";
          }
        }
        render(stdout, rows, state);
      } catch (error) {
        fail(error);
      }
    }

    stdin.on("keypress", onKeypress);
  });
}
