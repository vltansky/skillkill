import readline from "node:readline";
import { appendOmitPattern } from "./omit.js";
import { quarantineCandidates } from "./quarantine.js";

function write(stream, text) {
  stream.write(text);
}

function clip(value, width) {
  const text = String(value || "");
  if (width <= 1) return text.slice(0, Math.max(0, width));
  return text.length > width ? `${text.slice(0, width - 1)}.` : text.padEnd(width);
}

function rowSearchText(row) {
  return [
    row.skill,
    row.install_root,
    row.path,
    row.skill_dir,
    row.link_target,
    row.cleanup_reason,
    row.risk,
    String(row.description_token_cost),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function candidateRows(rows, state = {}) {
  const omitted = state.omitted || new Set();
  const search = String(state.search || "").trim().toLowerCase();
  return rows.filter(
    (row) =>
      row.cleanup_candidate &&
      !omitted.has(row.skill) &&
      (!search || rowSearchText(row).includes(search)),
  );
}

function allCandidateRows(rows, state = {}) {
  const omitted = state.omitted || new Set();
  return rows.filter((row) => row.cleanup_candidate && !omitted.has(row.skill));
}

function rowKey(row) {
  return row.id || row.skill;
}

function selectedCandidateRows(rows, state = {}) {
  const selected = state.selected || new Set();
  return candidateRows(rows, state).filter((row) => selected.has(rowKey(row)));
}

function tokenImpact(rows, picked, state = {}) {
  const removedTokens = picked.reduce((sum, row) => sum + row.description_token_cost, 0);
  const recentActivitySignals = rows.reduce((sum, row) => sum + row.recent_signal_count, 0);
  return {
    removedTokens,
    recentActivitySignals,
    savingsDays: state.savingsDays ?? 30,
    estimatedRepeatedSavings: removedTokens * recentActivitySignals,
  };
}

export function shouldRunInteractive(options, io = {}) {
  if (
    options.noInteractive ||
    options.command === "list" ||
    options.apply ||
    options.commands ||
    options.json ||
    options.undo
  ) {
    return false;
  }
  if (options.interactive) return true;

  const stdin = io.stdin || process.stdin;
  const stdout = io.stdout || process.stdout;
  return Boolean(stdin.isTTY && stdout.isTTY && !options.csv && !options.snapshot);
}

export function renderInteractiveScreen(rows, state = {}, dimensions = {}) {
  if (state.confirming) {
    return renderConfirmationScreen(rows, state, dimensions);
  }

  const allCandidates = allCandidateRows(rows, state);
  const candidates = candidateRows(rows, state);
  const total = rows.length;
  const protectedHidden = Math.max(0, total - allCandidates.length);
  const searchHidden = Math.max(0, allCandidates.length - candidates.length);
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
  const selectedVisible = candidates.filter((row) => selected.has(rowKey(row))).length;
  const riskWidth = 9;
  const tokenWidth = 6;
  const nameWidth = Math.min(30, Math.max(18, Math.floor(width * 0.24)));
  const reasonWidth = Math.min(38, Math.max(20, Math.floor(width * 0.32)));
  const dateWidth = 19;
  const pathWidth = Math.max(
    14,
    width - nameWidth - reasonWidth - dateWidth - riskWidth - tokenWidth - 21,
  );
  const search = String(state.search || "");

  const lines = [
    "skillkill interactive cleanup",
    `${allCandidates.length} cleanup candidates, ${selectedVisible} selected${search ? `, ${candidates.length} visible for /${search}` : ""}${omitted.size ? `, ${omitted.size} omitted this run` : ""}${searchHidden ? `, ${searchHidden} hidden by search` : ""}${protectedHidden ? `, ${protectedHidden} protected/recent/omitted` : ""}`,
    "",
    `   sel ${clip("risk", riskWidth)} ${clip("tokens", tokenWidth)} ${clip("skill", nameWidth)} ${clip("reason", reasonWidth)} ${clip("last strong use", dateWidth)} ${clip("path", pathWidth)}`,
    `   --- ${"-".repeat(riskWidth)} ${"-".repeat(tokenWidth)} ${"-".repeat(nameWidth)} ${"-".repeat(reasonWidth)} ${"-".repeat(dateWidth)} ${"-".repeat(pathWidth)}`,
  ];

  if (state.searching || search) {
    lines.push(`Search: /${search}${state.searching ? "_" : ""}`);
  }

  if (candidates.length === 0) {
    lines.push("", "No cleanup candidates.");
  } else {
    for (let index = start; index < end; index += 1) {
      const row = candidates[index];
      const active = index === cursor ? ">" : " ";
      const mark = selected.has(rowKey(row)) ? "[x]" : "[ ]";
      lines.push(
        `${active} ${mark} ${clip(row.risk, riskWidth)} ${clip(row.description_token_cost, tokenWidth)} ${clip(row.skill, nameWidth)} ${clip(row.cleanup_reason, reasonWidth)} ${clip(row.last_strong_read || "-", dateWidth)} ${clip(row.path, pathWidth)}`,
      );
    }
  }

  if (state.message) {
    lines.push("", state.message);
  } else {
    lines.push("");
  }

  lines.push(
    state.confirming
      ? "Confirm: enter quarantine, esc review"
      : state.searching
        ? "Search: type to filter, enter keep, esc clear, backspace delete"
        : "Keys: / search, up/down or j/k move, space/x select, a all, o omit, enter review, q quit",
  );
  lines.push("Use --no-interactive for the static table. Cleanup is quarantine-only and undoable.");
  return `${lines.join("\n")}\n`;
}

function renderConfirmationScreen(rows, state = {}, dimensions = {}) {
  const picked = selectedCandidateRows(rows, state);
  const height = Math.max(10, dimensions.rows || 24);
  const width = Math.max(72, dimensions.columns || 100);
  const visibleSkills = Math.max(1, height - 13);
  const shown = picked.slice(0, visibleSkills);
  const hidden = Math.max(0, picked.length - shown.length);
  const impact = tokenImpact(rows, picked, state);
  const skillWidth = Math.max(24, Math.min(48, Math.floor(width * 0.4)));
  const reasonWidth = Math.max(20, width - skillWidth - 28);

  const lines = [
    "skillkill confirm cleanup",
    "",
    `You are going to remove ${picked.length} skills from active use and move them to quarantine.`,
    "This is undoable with skillkill --undo.",
    "",
    "Selected skills:",
  ];

  if (picked.length === 0) {
    lines.push("  No selected cleanup candidates.");
  } else {
    for (const row of shown) {
      lines.push(
        `  - ${clip(row.skill, skillWidth)} ${clip(`${row.description_token_cost} tokens`, 12)} ${clip(row.cleanup_reason, reasonWidth)}`,
      );
    }
    if (hidden) lines.push(`  ... and ${hidden} more`);
  }

  lines.push(
    "",
    "Token effect:",
    `  Removed description tokens: ${impact.removedTokens}`,
    `  Recent activity baseline: ${impact.recentActivitySignals} signals/sessions in last ${impact.savingsDays} days`,
    `  Estimated repeated prompt savings: ${impact.estimatedRepeatedSavings} tokens`,
    "",
    "Press Enter to quarantine. Press Esc to return to review.",
    state.message ? state.message : "",
    "Confirm: enter quarantine, esc review",
  );
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
  if (result.vercelLocks?.removed?.length) {
    write(stdout, `Vercel skills lock: removed ${result.vercelLocks.removed.length} entries.\n`);
  }
  for (const error of result.vercelLocks?.errors || []) {
    write(stdout, `warning: could not update Vercel skills lock ${error.lockPath}: ${error.error}\n`);
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
    searching: false,
    search: "",
    savingsDays: options.savingsDays ?? 30,
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
      return selectedCandidateRows(rows, state);
    }

    function clampCursor() {
      const candidates = candidateRows(rows, state);
      state.cursor = Math.min(Math.max(0, state.cursor), Math.max(0, candidates.length - 1));
    }

    function toggleCurrent() {
      const row = candidateRows(rows, state)[state.cursor];
      if (!row) return;
      const key = rowKey(row);
      if (state.selected.has(key)) {
        state.selected.delete(key);
      } else {
        state.selected.add(key);
      }
      state.message = "";
    }

    function toggleAll() {
      const candidates = candidateRows(rows, state);
      if (candidates.length > 0 && candidates.every((row) => state.selected.has(rowKey(row)))) {
        for (const row of candidates) state.selected.delete(rowKey(row));
      } else {
        for (const row of candidates) state.selected.add(rowKey(row));
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
      state.selected.delete(rowKey(row));
      const saved = appendOmitPattern(options, row.skill);
      state.cursor = Math.min(state.cursor, Math.max(0, candidateRows(rows, state).length - 1));
      state.message = saved.saved
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
          if (key.name === "return" || key.name === "enter" || key.name === "y") {
            applySelected();
            return;
          }
          if (key.name === "n" || key.name === "escape" || key.name === "q") {
            state.confirming = false;
            state.message = "Cancelled.";
            render(stdout, rows, state);
            return;
          }
          state.message = "Press Enter to quarantine or Esc to review.";
          render(stdout, rows, state);
          return;
        }

        if (state.searching) {
          if (key.name === "escape") {
            state.search = "";
            state.searching = false;
            state.message = "Search cleared.";
            clampCursor();
          } else if (key.name === "return" || key.name === "enter") {
            state.searching = false;
            state.message = "";
          } else if (key.name === "backspace" || key.name === "delete") {
            state.search = String(state.search || "").slice(0, -1);
            state.message = "";
            clampCursor();
          } else if (_str && _str.length === 1 && !key.ctrl && !key.meta) {
            state.search = `${state.search || ""}${_str}`;
            state.message = "";
            clampCursor();
          }
          render(stdout, rows, state);
          return;
        }

        if (key.name === "escape" && state.search) {
          state.search = "";
          state.message = "Search cleared.";
          clampCursor();
          render(stdout, rows, state);
          return;
        }

        if (key.name === "q" || key.name === "escape") {
          finish({ payload, interactive: true, cancelled: true });
          return;
        }
        if (_str === "/" || key.name === "slash") {
          state.searching = true;
          state.message = "";
        } else if (key.name === "up" || key.name === "k") move(-1);
        else if (key.name === "down" || key.name === "j") move(1);
        else if (key.name === "space" || key.name === "x") toggleCurrent();
        else if (key.name === "a") toggleAll();
        else if (key.name === "o") omitCurrent();
        else if (key.name === "return" || key.name === "enter") {
          if (selectedRows().length === 0) {
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
