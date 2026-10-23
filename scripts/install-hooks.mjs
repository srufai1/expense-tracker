// Tells Git to use the hooks in .githooks/ (the pre-push check).
// Runs by itself after `npm install` or `npm ci` (the "prepare" script).
// Where Git is not available, such as some build servers, it does nothing.
import { execFileSync } from "node:child_process";

try {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
} catch {
  // Not a Git checkout: nothing to install.
}
