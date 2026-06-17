import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const binTarget = path.join(root, "bin", "skillkill.js");
const binDir = path.join(os.homedir(), ".local", "bin");
const commands = ["skillkill", "skill-kill", "skill-cleanup", "skill-prune"];

fs.mkdirSync(binDir, { recursive: true });

for (const command of commands) {
  const linkPath = path.join(binDir, command);
  try {
    const stat = fs.lstatSync(linkPath);
    if (!stat.isSymbolicLink()) {
      throw new Error(`${linkPath} exists and is not a symlink; refusing to replace it`);
    }
    fs.rmSync(linkPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  fs.symlinkSync(binTarget, linkPath);
  console.log(`${linkPath} -> ${binTarget}`);
}

console.log(`\nLinked local skillkill commands. Ensure ${binDir} is in PATH.`);
