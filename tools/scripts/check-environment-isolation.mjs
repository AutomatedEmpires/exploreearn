/**
 * check-environment-isolation.mjs — validate a REAL environment before deploying.
 *
 * Runs the Spark / production isolation rules in
 * apps/web/lib/deployment/environmentIsolation.ts against the current process
 * environment and exits non-zero on any violation. It prints variable NAMES
 * only, never values, so it is safe in CI logs.
 *
 * Intended use — against each Doppler config, before that environment's
 * variables are changed or a Spark project is created:
 *
 *   doppler run --config prd   -- node tools/scripts/check-environment-isolation.mjs
 *   doppler run --config spark -- node tools/scripts/check-environment-isolation.mjs
 *
 * Or against a Vercel environment pulled to a file you then delete:
 *
 *   vercel env pull /tmp/spark.env --environment=production   # in the Spark project
 *   node --env-file=/tmp/spark.env tools/scripts/check-environment-isolation.mjs && rm /tmp/spark.env
 *
 * It is NOT part of `pnpm guardrails` or the build: CI has no deployment
 * secrets, and wiring it into the Vercel build is a deploy-affecting change
 * (see SPARK_PRODUCTION_ISOLATION.md, stage 3). Requires Node >= 22.18 for
 * built-in TypeScript type stripping (the repo pins 24.16.0).
 */
// apps/web has no "type": "module" (and changing that is out of scope), so Node
// warns that it re-parsed the TS module as ESM. Drop only that one notice.
const emitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...rest) => {
  const code = typeof rest[0] === "object" ? rest[0]?.code : rest[1];
  if (code === "MODULE_TYPELESS_PACKAGE_JSON") return;
  emitWarning(warning, ...rest);
};

const { evaluateDeploymentEnvironment } = await import(
  "../../apps/web/lib/deployment/environmentIsolation.ts"
);

const json = process.argv.includes("--json");
const result = evaluateDeploymentEnvironment(process.env);

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const identity = result.environment ?? "UNRESOLVED";
  console.log(`environment-isolation: APP_ENV resolved to ${identity} (${result.source})`);
  for (const issue of result.errors) {
    console.error(`  ✗ ${issue.variable} [${issue.code}] ${issue.message}`);
  }
  for (const issue of result.warnings) {
    console.log(`  ! ${issue.variable} [${issue.code}] ${issue.message}`);
  }
  console.log(
    result.ok
      ? `environment-isolation OK (${result.warnings.length} warning(s)).`
      : `environment-isolation FAILED: ${result.errors.length} violation(s).`,
  );
}

process.exit(result.ok ? 0 : 1);
