import { execFileSync } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";

/**
 * check-binary-budget.mjs (guardrail G55)
 *
 * Stops the repository re-accumulating binary weight. By 2026-11 the tracked
 * tree had reached 159 MB, 136 MB of it design-reference PNGs under docs/, and
 * 57 MB of that was a byte-identical copy of another folder. Every clone pays
 * for every committed binary forever (git history is never cheaper than the
 * largest tip), so the guard sits at commit time, not cleanup time.
 *
 * Two rules, both over TRACKED files only (`git ls-files`):
 *
 *   1. No tracked file may exceed HARD_CAP_BYTES. No exceptions: anything that
 *      large belongs in external storage (Supabase Storage for product media,
 *      see docs/design/site-photos.md; the founder's design archive for comps).
 *   2. No tracked file may exceed FILE_BUDGET_BYTES unless it is listed in the
 *      baseline. Like G50-G52 this is a RATCHET: the baseline records each
 *      grandfathered file and its size, CI fails when a new large file appears
 *      or a grandfathered one GROWS, and `--update` only ever removes entries or
 *      lowers sizes (the ratchet only tightens).
 *
 * Product images under apps/web/public/ are already well under the per-file
 * budget (largest ~0.5 MB) and need no entry. This script never edits files
 * other than its own baseline, and only with --update.
 */

const FILE_BUDGET_BYTES = 1024 * 1024; // 1 MiB
const HARD_CAP_BYTES = 5 * 1024 * 1024; // 5 MiB
const BASELINE_PATH = "tools/scripts/binary-budget-baseline.json";
const UPDATE = process.argv.includes("--update");

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

/** @type {Map<string, number>} */
const sizes = new Map();
for (const file of tracked) {
  try {
    const stat = statSync(file);
    if (stat.isFile()) sizes.set(file, stat.size);
  } catch {
    // Deleted in the working tree but not yet staged: not part of the next tree.
  }
}

/** @type {Record<string, number>} */
const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
const violations = [];
const tightened = [];

for (const [file, size] of sizes) {
  if (size > HARD_CAP_BYTES) {
    violations.push(
      `${file}: ${mb(size)} exceeds the ${mb(HARD_CAP_BYTES)} hard cap — move it to external storage`,
    );
    continue;
  }
  if (size <= FILE_BUDGET_BYTES) continue;

  const allowed = baseline[file];
  if (allowed === undefined) {
    violations.push(
      `${file}: ${mb(size)} is over the ${mb(FILE_BUDGET_BYTES)} per-file budget and not grandfathered — compress it, or keep it outside git`,
    );
  } else if (size > allowed) {
    violations.push(
      `${file}: grew from ${mb(allowed)} to ${mb(size)} — grandfathered files may only shrink`,
    );
  }
}

for (const [file, allowed] of Object.entries(baseline)) {
  const size = sizes.get(file);
  if (size === undefined || size <= FILE_BUDGET_BYTES || size < allowed) {
    tightened.push(file);
  }
}

if (violations.length > 0) {
  console.error(`G55 binary budget FAILED (${violations.length}):`);
  for (const line of violations) console.error(`  - ${line}`);
  process.exit(1);
}

if (UPDATE) {
  /** @type {Record<string, number>} */
  const next = {};
  for (const file of Object.keys(baseline).sort()) {
    const size = sizes.get(file);
    if (size !== undefined && size > FILE_BUDGET_BYTES) {
      next[file] = Math.min(size, baseline[file]);
    }
  }
  writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
  console.log(
    `G55 binary budget: baseline tightened to ${Object.keys(next).length} grandfathered file(s).`,
  );
  process.exit(0);
}

const total = [...sizes.values()].reduce((sum, size) => sum + size, 0);
const grandfathered = Object.keys(baseline).length - tightened.length;
console.log(
  `G55 binary budget OK: ${sizes.size} tracked files, ${mb(total)} total; ` +
    `${grandfathered} grandfathered file(s) over ${mb(FILE_BUDGET_BYTES)}, none over ${mb(HARD_CAP_BYTES)}.`,
);
if (tightened.length > 0) {
  console.log(
    `  ${tightened.length} baseline entr${tightened.length === 1 ? "y is" : "ies are"} now smaller or gone — run with --update to tighten the ratchet.`,
  );
}

/** @param {number} bytes */
function mb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}
