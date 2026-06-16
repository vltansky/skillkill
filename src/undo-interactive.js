import path from "node:path";
import readline from "node:readline";
import { listCleanupRuns, restoreCleanupRun } from "./quarantine.js";

function write(stream, text) {
  stream.write(text);
}

function clip(value, width) {
  const text = String(value || "");
  if (width <= 1) return text.slice(0, Math.max(0, width));
  return text.length > width ? `${text.slice(0, width - 1)}.` : text.padEnd(width);
}

function runStatus(run) {
  if (!run.restoredAt) return "ready";
  if (run.skipped.length > 0) return `restored, ${run.skipped.length} skipped`;
  return "restored";
}

export function renderInteractiveUndoScreen(runs, state = {}, dimensions = {}) {
  const cursor = Math.min(Math.max(0, state.cursor || 0), Math.max(0, runs.length - 1));
  const height = Math.max(10, dimensions.rows || 24);
  const width = Math.max(72, dimensions.columns || 100);
  const visible = Math.max(3, height - 9);
  const start = Math.min(
    Math.max(0, cursor - Math.floor(visible / 2)),
    Math.max(0, runs.length - visible),
  );
  const end = Math.min(runs.length, start + visible);
  const dateWidth = 19;
  const countWidth = 7;
  const statusWidth = 22;
  const idWidth = Math.min(34, Math.max(20, Math.floor(width * 0.3)));
  const manifestWidth = Math.max(14, width - idWidth - dateWidth - countWidth - statusWidth - 11);
  const selectedRun = runs[cursor];

  const lines = [
    "skillkill interactive undo",
    `${runs.length} cleanup runs`,
    "",
    `  ${clip("run", idWidth)} ${clip("created", dateWidth)} ${clip("skills", countWidth)} ${clip("status", statusWidth)} ${clip("manifest", manifestWidth)}`,
    `  ${"-".repeat(idWidth)} ${"-".repeat(dateWidth)} ${"-".repeat(countWidth)} ${"-".repeat(statusWidth)} ${"-".repeat(manifestWidth)}`,
  ];

  if (runs.length === 0) {
    lines.push("", "No cleanup runs found.");
  } else {
    for (let index = start; index < end; index += 1) {
      const run = runs[index];
      const active = index === cursor ? ">" : " ";
      lines.push(
        `${active} ${clip(run.id, idWidth)} ${clip(run.createdAt.replace("T", " ").replace("Z", ""), dateWidth)} ${clip(run.entries.length, countWidth)} ${clip(runStatus(run), statusWidth)} ${clip(run.manifest, manifestWidth)}`,
      );
    }
  }

  if (state.confirming && selectedRun) {
    lines.push(
      "",
      "! CONFIRM RESTORE",
      `  ${selectedRun.entries.length} skills will be restored from ${selectedRun.id}.`,
      "  Press Y to restore, N/Esc to go back.",
      state.message ? `  ${state.message}` : "",
    );
  } else if (state.message) {
    lines.push("", state.message);
  } else {
    lines.push("");
  }

  lines.push(
    state.confirming
      ? "Confirm: y restore, n/esc cancel"
      : "Keys: up/down or j/k move, enter restore, q quit",
  );
  lines.push("Direct restore remains available with --undo latest, --undo RUN_ID, or --undo PATH.");
  return `${lines.join("\n")}\n`;
}

function render(stdout, runs, state) {
  write(stdout, "\x1b[2J\x1b[H");
  write(
    stdout,
    renderInteractiveUndoScreen(runs, state, {
      columns: stdout.columns,
      rows: stdout.rows,
    }),
  );
}

export async function runInteractiveUndo(options, io = {}) {
  const stdin = io.stdin || process.stdin;
  const stdout = io.stdout || process.stdout;

  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Interactive undo requires a TTY. Use --undo latest, --undo RUN_ID, or --undo PATH.");
  }

  const runs = listCleanupRuns(options.stateDir);
  if (runs.length === 0) {
    write(stdout, `No cleanup runs found in ${path.join(options.stateDir, "runs")}.\n`);
    return { interactive: true, undo: { manifest: "", restored: [], skipped: [] } };
  }

  const state = {
    cursor: 0,
    confirming: false,
    message: "",
  };
  const wasRaw = stdin.isRaw;

  readline.emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  write(stdout, "\x1b[?25l");
  render(stdout, runs, state);

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

    function move(delta) {
      state.cursor = Math.min(Math.max(0, state.cursor + delta), runs.length - 1);
      state.message = "";
    }

    function restoreCurrent() {
      const run = runs[state.cursor];
      const result = restoreCleanupRun(options.stateDir, run.manifest);
      finished = true;
      cleanup();
      resolve({ interactive: true, undo: result });
    }

    function onKeypress(_str, key = {}) {
      try {
        if (key.ctrl && key.name === "c") {
          finish({ interactive: true, cancelled: true });
          return;
        }

        if (state.confirming) {
          if (key.name === "y") {
            restoreCurrent();
            return;
          }
          if (key.name === "n" || key.name === "escape" || key.name === "q") {
            state.confirming = false;
            state.message = "Cancelled.";
            render(stdout, runs, state);
            return;
          }
          state.message = "Waiting for Y to restore or N to cancel.";
          render(stdout, runs, state);
          return;
        }

        if (key.name === "q" || key.name === "escape") {
          finish({ interactive: true, cancelled: true });
          return;
        }
        if (key.name === "up" || key.name === "k") move(-1);
        else if (key.name === "down" || key.name === "j") move(1);
        else if (key.name === "return" || key.name === "enter") {
          state.confirming = true;
          state.message = "";
        }
        render(stdout, runs, state);
      } catch (error) {
        fail(error);
      }
    }

    stdin.on("keypress", onKeypress);
  });
}
