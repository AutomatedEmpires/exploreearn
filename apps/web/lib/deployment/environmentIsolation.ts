/**
 * Deployment identity and Spark / production isolation — the pure rule set.
 *
 * WHY THIS EXISTS. Explore&Earn has exactly one hosted Supabase project, and it
 * is production (`mamosbzcbigcclafhmmr`; it was provisioned as "staging" and
 * promoted). Previews build with NODE_ENV=production, so nothing in the code
 * tells a preview from production: separation rests entirely on Vercel's
 * per-environment variable scoping, and several reads fall back to production
 * silently — 14 `NEXT_PUBLIC_APP_URL || "https://exploreandearn.com"` sites,
 * including Stripe success/cancel URLs and email links. A Spark (demonstration)
 * deployment assembled by copying production variables would therefore write
 * to the production database, send real email and track into production
 * analytics, with no error anywhere. See docs/audit/repo-optimization-2026-11/
 * SPARK_PRODUCTION_ISOLATION.md.
 *
 * WHAT THIS DOES. `evaluateDeploymentEnvironment(env)` takes an environment
 * map and returns the resolved identity plus every violation, FAIL-CLOSED:
 *
 *   - identity is explicit (`APP_ENV`) on anything deployed — never inferred;
 *   - no non-production identity may hold a production credential, endpoint or
 *     analytics key (checked against the public production fingerprint below);
 *   - Spark additionally may not send email or notifications, and must name its
 *     own app URL so no link or Stripe return can fall back to production;
 *   - production must have every required secret — no silent no-op.
 *
 * It is deliberately NOT wired into the runtime or the build yet: doing so is
 * a deploy-affecting change that must wait until each environment's variables
 * have been validated with the CLI (tools/scripts/check-environment-isolation.mjs).
 * The module has no imports and uses only erasable TypeScript so that CLI can
 * load it with Node's built-in type stripping.
 *
 * Messages carry variable NAMES only. A value is never echoed, so the report is
 * safe to print in CI logs.
 */

export const DEPLOYMENT_ENVIRONMENTS = [
  "production",
  "spark",
  "preview",
  "development",
  "test",
] as const;

export type DeploymentEnvironment = (typeof DEPLOYMENT_ENVIRONMENTS)[number];

export type EnvMap = Readonly<Record<string, string | undefined>>;

export interface EnvironmentIssue {
  readonly code: string;
  readonly variable: string;
  readonly message: string;
}

export interface EnvironmentEvaluation {
  /** null only when the identity itself could not be resolved. */
  readonly environment: DeploymentEnvironment | null;
  readonly source: "explicit" | "derived-local" | "unresolved";
  readonly ok: boolean;
  readonly errors: readonly EnvironmentIssue[];
  readonly warnings: readonly EnvironmentIssue[];
}

/**
 * Public identifiers of the production estate. None of these is a secret: the
 * Supabase ref and app host are in every page, the Clerk frontend API is in the
 * CSP, and the PostHog key ships to every browser. They are a FINGERPRINT —
 * the thing a non-production environment must never match.
 */
export const PRODUCTION_FINGERPRINT = {
  supabaseProjectRef: "mamosbzcbigcclafhmmr",
  appHosts: ["exploreandearn.com", "www.exploreandearn.com"],
  clerkFrontendApiHost: "clerk.exploreandearn.com",
  posthogProjectKey: "phc_67Nw1vQub5gHQITDXnsD81CuWdng9piIzPUv27hGb8r",
} as const;

/** Every one must be present and non-blank in production. */
export const PRODUCTION_REQUIRED = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "CRON_SECRET",
  "NOTIFICATION_SIGNING_SECRET",
] as const;

/** Spark must not be able to send anything to a real inbox or device. */
const SPARK_FORBIDDEN_SENDERS = [
  "RESEND_API_KEY",
  "VAPID_PRIVATE_KEY",
] as const;

/** Local-only switches that must never be on in a deployed environment. */
const LOCAL_ONLY_FLAGS = ["NEXT_PUBLIC_DEV_BENCH"] as const;

export function evaluateDeploymentEnvironment(
  env: EnvMap,
): EnvironmentEvaluation {
  const errors: EnvironmentIssue[] = [];
  const warnings: EnvironmentIssue[] = [];
  const error = (code: string, variable: string, message: string) =>
    errors.push({ code, variable, message });
  const warn = (code: string, variable: string, message: string) =>
    warnings.push({ code, variable, message });

  const deployed = isDeployed(env);
  const declared = value(env, "APP_ENV");
  let environment: DeploymentEnvironment | null = null;
  let source: EnvironmentEvaluation["source"] = "unresolved";

  // ── 1. Identity: explicit when deployed, never guessed ────────────────────
  if (declared !== undefined) {
    if (isDeploymentEnvironment(declared)) {
      environment = declared;
      source = "explicit";
    } else {
      error(
        "identity.invalid",
        "APP_ENV",
        `APP_ENV must be one of ${DEPLOYMENT_ENVIRONMENTS.join(", ")}.`,
      );
    }
  } else if (deployed) {
    error(
      "identity.missing",
      "APP_ENV",
      "APP_ENV is required on every deployed or production-mode build; the environment is never inferred.",
    );
  } else {
    environment = value(env, "NODE_ENV") === "test" ? "test" : "development";
    source = "derived-local";
  }

  if (environment === null) {
    return { environment, source, ok: false, errors, warnings };
  }

  // ── 2. The platform must agree with the declared identity ─────────────────
  const vercelEnv = value(env, "VERCEL_ENV");
  if (environment === "production" && deployed && vercelEnv !== "production") {
    error(
      "identity.platform-mismatch",
      "VERCEL_ENV",
      "APP_ENV=production is only valid on a Vercel production deployment.",
    );
  }
  if (environment === "preview" && vercelEnv === "production") {
    error(
      "identity.platform-mismatch",
      "VERCEL_ENV",
      "APP_ENV=preview cannot run on a Vercel production deployment.",
    );
  }
  if (
    (environment === "development" || environment === "test") &&
    vercelEnv !== undefined
  ) {
    error(
      "identity.platform-mismatch",
      "APP_ENV",
      `APP_ENV=${environment} is for local machines and CI, not a Vercel deployment.`,
    );
  }

  // ── 3. Local-only switches never ship ─────────────────────────────────────
  if (deployed) {
    for (const flag of LOCAL_ONLY_FLAGS) {
      if (isOn(value(env, flag))) {
        error("flag.local-only", flag, `${flag} must not be enabled on a deployed environment.`);
      }
    }
  }
  if (environment !== "preview" && isOn(value(env, "PREVIEW_MAP_FIXTURES"))) {
    error(
      "flag.preview-only",
      "PREVIEW_MAP_FIXTURES",
      "PREVIEW_MAP_FIXTURES is only allowed on APP_ENV=preview.",
    );
  }

  if (environment === "production") {
    checkProduction(env, error, warn);
  } else {
    checkNoProductionReach(env, error);
    if (environment === "spark") checkSpark(env, error, warn);
  }

  return { environment, source, ok: errors.length === 0, errors, warnings };
}

// ── Rule groups ──────────────────────────────────────────────────────────────

type Report = (code: string, variable: string, message: string) => void;

function checkProduction(env: EnvMap, error: Report, warn: Report): void {
  for (const name of PRODUCTION_REQUIRED) {
    if (value(env, name) === undefined) {
      error("production.missing", name, `${name} is required in production and must not fall back.`);
    }
  }
  if (!hasKvPair(env)) {
    error(
      "production.missing",
      "KV_REST_API_URL",
      "A KV/Upstash REST URL and token are required in production: without them rate limits are per-instance and listing decisions fail closed.",
    );
  }

  const supabaseRef = supabaseRefFromUrl(value(env, "NEXT_PUBLIC_SUPABASE_URL"));
  if (supabaseRef !== undefined && supabaseRef !== PRODUCTION_FINGERPRINT.supabaseProjectRef) {
    error(
      "production.wrong-target",
      "NEXT_PUBLIC_SUPABASE_URL",
      "Production must point at the production Supabase project.",
    );
  }
  const appHost = hostOf(value(env, "NEXT_PUBLIC_APP_URL"));
  if (appHost !== undefined && !isProductionHost(appHost)) {
    error("production.wrong-target", "NEXT_PUBLIC_APP_URL", "Production must use the production app host.");
  }

  // Live charging is a founder approval gate; until it is cleared, production
  // legitimately runs Stripe test mode. Report it, never block on it.
  if (value(env, "STRIPE_SECRET_KEY")?.startsWith("sk_test_")) {
    warn(
      "production.stripe-test-mode",
      "STRIPE_SECRET_KEY",
      "Production is using a Stripe test-mode key (expected until the live-payments gate is cleared).",
    );
  }
}

/** Shared by spark, preview, development and test. */
function checkNoProductionReach(env: EnvMap, error: Report): void {
  const prodRef = PRODUCTION_FINGERPRINT.supabaseProjectRef;

  if (supabaseRefFromUrl(value(env, "NEXT_PUBLIC_SUPABASE_URL")) === prodRef) {
    error("isolation.production-database", "NEXT_PUBLIC_SUPABASE_URL", "Points at the production Supabase project.");
  }
  if (value(env, "DATABASE_URL")?.includes(prodRef)) {
    error("isolation.production-database", "DATABASE_URL", "Points at the production database.");
  }
  for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
    if (jwtClaim(value(env, name), "ref") === prodRef) {
      error("isolation.production-credential", name, "Is a key issued by the production Supabase project.");
    }
  }

  for (const name of ["STRIPE_SECRET_KEY", "STRIPE_TEST_SECRET_KEY"]) {
    const key = value(env, name);
    if (key?.startsWith("sk_live_") || key?.startsWith("rk_live_")) {
      error("isolation.live-payments", name, "Is a live-mode Stripe key; only test-mode keys are allowed outside production.");
    }
  }
  if (value(env, "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY")?.startsWith("pk_live_")) {
    error("isolation.live-payments", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "Is a live-mode Stripe key.");
  }

  if (value(env, "CLERK_SECRET_KEY")?.startsWith("sk_live_")) {
    error("isolation.production-auth", "CLERK_SECRET_KEY", "Is a production Clerk instance key.");
  }
  const clerkPk = value(env, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  if (
    clerkPk?.startsWith("pk_live_") ||
    clerkFrontendApiHost(clerkPk) === PRODUCTION_FINGERPRINT.clerkFrontendApiHost
  ) {
    error("isolation.production-auth", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "Is the production Clerk instance.");
  }

  if (value(env, "NEXT_PUBLIC_POSTHOG_KEY") === PRODUCTION_FINGERPRINT.posthogProjectKey) {
    error("isolation.production-analytics", "NEXT_PUBLIC_POSTHOG_KEY", "Is the production PostHog project key.");
  }

  const appHost = hostOf(value(env, "NEXT_PUBLIC_APP_URL"));
  if (appHost !== undefined && isProductionHost(appHost)) {
    error("isolation.production-url", "NEXT_PUBLIC_APP_URL", "Is the production app host.");
  }
}

function checkSpark(env: EnvMap, error: Report, warn: Report): void {
  // No fallback may route a link, a Stripe return or a sitemap to production.
  if (value(env, "NEXT_PUBLIC_APP_URL") === undefined) {
    error(
      "spark.missing",
      "NEXT_PUBLIC_APP_URL",
      "Spark must set its own app URL; unset, 14 call sites fall back to the production host.",
    );
  }
  // Without a database the production-mode build has no fixture fallback, so
  // Spark needs its OWN project (checked non-production above).
  if (value(env, "NEXT_PUBLIC_SUPABASE_URL") === undefined) {
    error("spark.missing", "NEXT_PUBLIC_SUPABASE_URL", "Spark needs its own (non-production) Supabase project.");
  }

  for (const name of SPARK_FORBIDDEN_SENDERS) {
    if (value(env, name) !== undefined) {
      error("spark.outbound", name, `${name} must be unset in Spark: Spark never delivers to real inboxes or devices.`);
    }
  }
  const stage = value(env, "NOTIFICATION_ENGINE_STAGE");
  if (stage !== undefined && stage !== "disabled") {
    error("spark.outbound", "NOTIFICATION_ENGINE_STAGE", "Must be unset or \"disabled\" in Spark.");
  }

  if (value(env, "STRIPE_SECRET_KEY") === undefined) {
    warn("spark.billing-off", "STRIPE_SECRET_KEY", "Unset: checkout will be unavailable in Spark (allowed).");
  }
  if (value(env, "NEXT_PUBLIC_POSTHOG_KEY") !== undefined) {
    warn(
      "spark.analytics",
      "NEXT_PUBLIC_POSTHOG_KEY",
      "Spark is tracking into a PostHog project; confirm it is a dedicated non-production project.",
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Treats blank and whitespace-only values as absent — an empty secret is a missing secret. */
function value(env: EnvMap, name: string): string | undefined {
  const raw = env[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function isDeploymentEnvironment(candidate: string): candidate is DeploymentEnvironment {
  return (DEPLOYMENT_ENVIRONMENTS as readonly string[]).includes(candidate);
}

/** A Vercel deployment, or any production-mode Next build/runtime. */
function isDeployed(env: EnvMap): boolean {
  return (
    value(env, "VERCEL") === "1" ||
    value(env, "VERCEL_ENV") !== undefined ||
    value(env, "NODE_ENV") === "production"
  );
}

function isOn(flag: string | undefined): boolean {
  return flag === "1" || flag === "true";
}

function hasKvPair(env: EnvMap): boolean {
  const url = value(env, "KV_REST_API_URL") ?? value(env, "UPSTASH_REDIS_REST_URL");
  const token = value(env, "KV_REST_API_TOKEN") ?? value(env, "UPSTASH_REDIS_REST_TOKEN");
  return url !== undefined && token !== undefined;
}

function hostOf(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function isProductionHost(host: string): boolean {
  return (PRODUCTION_FINGERPRINT.appHosts as readonly string[]).includes(host);
}

/** `https://<ref>.supabase.co` → `<ref>`; anything else (local, custom) → undefined. */
function supabaseRefFromUrl(url: string | undefined): string | undefined {
  const host = hostOf(url);
  const match = host === undefined ? null : /^([a-z0-9]+)\.supabase\.(co|in)$/.exec(host);
  return match?.[1];
}

/** Reads one claim from an UNVERIFIED JWT payload. Identification only, never trust. */
function jwtClaim(token: string | undefined, claim: string): string | undefined {
  const payload = token?.split(".")[1];
  if (payload === undefined) return undefined;
  try {
    const json = JSON.parse(decodeBase64Url(payload)) as Record<string, unknown>;
    const found = json[claim];
    return typeof found === "string" ? found : undefined;
  } catch {
    return undefined;
  }
}

/** A Clerk publishable key is `pk_(test|live)_` + base64("<frontend-api-host>$"). */
function clerkFrontendApiHost(key: string | undefined): string | undefined {
  const encoded = /^pk_(?:test|live)_(.+)$/.exec(key ?? "")?.[1];
  if (encoded === undefined) return undefined;
  try {
    return decodeBase64Url(encoded).replace(/\$$/, "").toLowerCase();
  } catch {
    return undefined;
  }
}

function decodeBase64Url(input: string): string {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return atob(padded);
}
