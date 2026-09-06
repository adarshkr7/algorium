import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Runs every `*.test.mts` under src/.
 *
 * These suites are plain scripts that assert with `console.log` and exit
 * non-zero on failure — no test framework, matching what was already here.
 *
 * Each runs under tsx's `react-server` condition, because most of what is
 * worth testing sits behind `server-only` and that package throws outside it.
 * A suite covering client code hits the mirror-image problem with
 * `client-only`, so it opts out with `// @runtime client` on its first line.
 */

const CLIENT_MARKER = "@runtime client";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

function findTests(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...findTests(full));
    } else if (entry.endsWith(".test.mts")) {
      found.push(full);
    }
  }
  return found;
}

const tests = findTests(SRC).sort();

if (tests.length === 0) {
  console.error("No *.test.mts files found under src/");
  process.exit(1);
}

let failed = 0;

const TSX = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");

for (const file of tests) {
  const name = relative(ROOT, file).split(sep).join("/");
  const isClient = readFileSync(file, "utf8").includes(CLIENT_MARKER);
  const label = `${name}${isClient ? "  [client]" : ""}`;
  console.log(`\n─── ${label} ${"─".repeat(Math.max(0, 60 - label.length))}`);

  const args = isClient ? [TSX, file] : [TSX, "--conditions", "react-server", file];
  const result = spawnSync(process.execPath, args, { stdio: "inherit", cwd: ROOT });

  if (result.status !== 0) failed++;
}

console.log(
  `\n${tests.length - failed}/${tests.length} suite(s) passed.`,
);
process.exit(failed > 0 ? 1 : 0);
