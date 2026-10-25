// Fails when a Supabase secret key, or the words that point to one, appear
// anywhere under src/ (AGENTS.md, Security). The same search as the GitHub
// CI step, written in Node so it also runs on Windows, in `npm run check`
// and before every push, while GitHub CI is not available.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN = /sb_secret_|service_role/;

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const found = files("src").flatMap((path) =>
  readFileSync(path, "utf8")
    .split("\n")
    .map((line, i) => ({ path, line: i + 1, text: line }))
    .filter(({ text }) => FORBIDDEN.test(text)),
);

if (found.length > 0) {
  for (const { path, line, text } of found) console.error(`${path}:${line}: ${text.trim()}`);
  console.error("Found a Supabase secret key or service_role reference under src/. Remove it.");
  process.exit(1);
}
console.log("check:secrets: no secret key under src/.");
