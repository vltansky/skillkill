import os from "node:os";
import path from "node:path";

export const DEFAULT_OPTIONS = {
  skillsDir: "~/.agents/skills",
  codexDir: "~/.codex",
  claudeDir: "~/.claude",
  source: "all",
  unusedDays: 45,
  unusedInstalledDays: 7,
  limit: 40,
  fullScan: false,
  json: false,
  csv: "",
  snapshot: "",
  stateDir: "~/.local/state/skillkill",
  commands: false,
  interactive: false,
  noInteractive: false,
  apply: false,
  undo: "",
};

export function expandHome(value, home = os.homedir()) {
  if (!value) return value;
  if (value === "~") return home;
  return value.startsWith("~/") ? path.join(home, value.slice(2)) : value;
}

function readNext(argv, index, arg) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${arg} requires a value`);
  }
  return value;
}

function readNumber(argv, index, arg) {
  const value = Number(readNext(argv, index, arg));
  if (Number.isNaN(value) || value < 0) {
    throw new Error(`${arg} must be a non-negative number`);
  }
  return value;
}

export function printHelp() {
  return `Usage: skillkill [options]

Options:
  --path PATH                     Skills directory to scan (default: ~/.agents/skills)
  --skills-dir PATH               Alias for --path
  --source codex|claude|all       Evidence source to scan (default: all)
  --codex-dir PATH                Codex state directory (default: ~/.codex)
  --claude-dir PATH               Claude state directory (default: ~/.claude)
  --unused-days N                 Mark skills stale after N days (default: 45)
  --unused-installed-days N       Propose never-used skills older than N days (default: 7)
  --limit N                       Table row limit (default: 40)
  --commands                      Print all candidate rm commands
  --json                          Print JSON payload to stdout
  --csv PATH                      Write CSV rows
  --snapshot PATH                 Append a JSONL snapshot
  --state-dir PATH                Cleanup state directory (default: ~/.local/state/skillkill)
  --interactive                   Force interactive terminal review
  --no-interactive                Print the static table instead of terminal review
  --apply                         Move cleanup candidates to quarantine
  --undo latest|RUN_ID|PATH       Restore a previous cleanup run
  --full-scan                     Parse every JSONL line instead of using ripgrep prefilter
  -h, --help                      Show help

Default behavior is interactive when stdin/stdout are terminals, otherwise static dry-run.
--apply writes an undo manifest; restore with --undo latest.
Command aliases: skill-kill, skill-cleanup, skill-prune.
`;
}

export function parseArgs(argv) {
  const options = { ...DEFAULT_OPTIONS };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--path" || arg === "--skills-dir") {
      options.skillsDir = readNext(argv, i, arg);
      i += 1;
    } else if (arg === "--source") {
      options.source = readNext(argv, i, arg);
      i += 1;
    } else if (arg === "--codex-dir") {
      options.codexDir = readNext(argv, i, arg);
      i += 1;
    } else if (arg === "--claude-dir") {
      options.claudeDir = readNext(argv, i, arg);
      i += 1;
    } else if (arg === "--unused-days") {
      options.unusedDays = readNumber(argv, i, arg);
      i += 1;
    } else if (arg === "--unused-installed-days") {
      options.unusedInstalledDays = readNumber(argv, i, arg);
      i += 1;
    } else if (arg === "--limit") {
      options.limit = readNumber(argv, i, arg);
      i += 1;
    } else if (arg === "--csv") {
      options.csv = readNext(argv, i, arg);
      i += 1;
    } else if (arg === "--snapshot") {
      options.snapshot = readNext(argv, i, arg);
      i += 1;
    } else if (arg === "--state-dir") {
      options.stateDir = readNext(argv, i, arg);
      i += 1;
    } else if (arg === "--commands") {
      options.commands = true;
    } else if (arg === "--interactive") {
      options.interactive = true;
    } else if (arg === "--no-interactive") {
      options.noInteractive = true;
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--undo") {
      options.undo = readNext(argv, i, arg);
      i += 1;
    } else if (arg === "--full-scan") {
      options.fullScan = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!["codex", "claude", "all"].includes(options.source)) {
    throw new Error("--source must be codex, claude, or all");
  }
  if (options.apply && options.json) {
    throw new Error("--apply cannot be combined with --json");
  }
  if (options.apply && options.commands) {
    throw new Error("--apply cannot be combined with --commands");
  }
  if (options.interactive && options.noInteractive) {
    throw new Error("--interactive cannot be combined with --no-interactive");
  }
  if (options.interactive && (options.apply || options.commands || options.json)) {
    throw new Error("--interactive cannot be combined with --apply, --commands, or --json");
  }
  if (options.undo && (options.apply || options.commands || options.json || options.csv || options.snapshot)) {
    throw new Error("--undo cannot be combined with scan/output/apply options");
  }

  return {
    ...options,
    skillsDir: path.resolve(expandHome(options.skillsDir)),
    codexDir: path.resolve(expandHome(options.codexDir)),
    claudeDir: path.resolve(expandHome(options.claudeDir)),
    csv: options.csv ? path.resolve(expandHome(options.csv)) : "",
    snapshot: options.snapshot ? path.resolve(expandHome(options.snapshot)) : "",
    stateDir: path.resolve(expandHome(options.stateDir)),
    undo:
      options.undo && (options.undo.includes("/") || options.undo.startsWith("~"))
        ? path.resolve(expandHome(options.undo))
        : options.undo,
  };
}
