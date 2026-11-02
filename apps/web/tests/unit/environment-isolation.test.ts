/**
 * SPARK MUST NOT BE ABLE TO TOUCH PRODUCTION, AND PRODUCTION MUST NOT RUN HALF-CONFIGURED.
 *
 * Pins lib/deployment/environmentIsolation.ts — see that file and
 * docs/audit/repo-optimization-2026-11/SPARK_PRODUCTION_ISOLATION.md. Every
 * credential here is a deliberately short fake: the rules match on prefixes,
 * hosts and JWT claims, never on a real secret's shape.
 */
import { describe, expect, it } from "vitest";

import {
  evaluateDeploymentEnvironment,
  PRODUCTION_FINGERPRINT,
  PRODUCTION_REQUIRED,
  type EnvMap,
} from "../../lib/deployment/environmentIsolation";

const PROD_REF = PRODUCTION_FINGERPRINT.supabaseProjectRef;
const SPARK_REF = "sparkdemoprojectref0";

function fakeJwt(payload: Record<string, string>): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, "");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.fakesignature`;
}

function clerkPk(mode: "test" | "live", host: string): string {
  return `pk_${mode}_${btoa(`${host}$`)}`;
}

/** A complete, healthy production configuration. */
function production(overrides: Record<string, string | undefined> = {}): EnvMap {
  return {
    NODE_ENV: "production",
    VERCEL: "1",
    VERCEL_ENV: "production",
    APP_ENV: "production",
    NEXT_PUBLIC_APP_URL: "https://exploreandearn.com",
    NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: fakeJwt({ role: "anon", ref: PROD_REF }),
    SUPABASE_SERVICE_ROLE_KEY: fakeJwt({ role: "service_role", ref: PROD_REF }),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: clerkPk("live", PRODUCTION_FINGERPRINT.clerkFrontendApiHost),
    CLERK_SECRET_KEY: "sk_live_fake",
    CLERK_WEBHOOK_SECRET: "whsec_fake",
    STRIPE_SECRET_KEY: "sk_live_fake",
    STRIPE_WEBHOOK_SECRET: "whsec_fake",
    RESEND_API_KEY: "re_fake",
    CRON_SECRET: "fake-cron",
    NOTIFICATION_SIGNING_SECRET: "fake-signing",
    KV_REST_API_URL: "https://kv.example.test",
    KV_REST_API_TOKEN: "fake-kv",
    ...overrides,
  };
}

/** A correctly isolated Spark configuration. */
function spark(overrides: Record<string, string | undefined> = {}): EnvMap {
  return {
    NODE_ENV: "production",
    VERCEL: "1",
    // Spark is its own Vercel project, so its main deployment IS "production"
    // as far as Vercel is concerned. APP_ENV is what names it.
    VERCEL_ENV: "production",
    APP_ENV: "spark",
    NEXT_PUBLIC_APP_URL: "https://spark.example.test",
    NEXT_PUBLIC_SUPABASE_URL: `https://${SPARK_REF}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: fakeJwt({ role: "anon", ref: SPARK_REF }),
    SUPABASE_SERVICE_ROLE_KEY: fakeJwt({ role: "service_role", ref: SPARK_REF }),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: clerkPk("test", "spark-demo.clerk.accounts.dev"),
    CLERK_SECRET_KEY: "sk_test_fake",
    STRIPE_SECRET_KEY: "sk_test_fake",
    ...overrides,
  };
}

function codes(env: EnvMap): string[] {
  return evaluateDeploymentEnvironment(env).errors.map(
    (issue) => `${issue.code}:${issue.variable}`,
  );
}

describe("identity is explicit, never inferred", () => {
  it("refuses a deployed build that does not declare APP_ENV", () => {
    const result = evaluateDeploymentEnvironment(production({ APP_ENV: undefined }));
    expect(result.ok).toBe(false);
    expect(result.environment).toBeNull();
    expect(codes(production({ APP_ENV: undefined }))).toEqual(["identity.missing:APP_ENV"]);
  });

  it("treats NODE_ENV=production alone as deployed (a local `next start` against real env)", () => {
    expect(codes({ NODE_ENV: "production" })).toEqual(["identity.missing:APP_ENV"]);
  });

  it("refuses an unknown identity rather than guessing", () => {
    expect(codes(production({ APP_ENV: "prod" }))).toEqual(["identity.invalid:APP_ENV"]);
  });

  it("treats a blank APP_ENV as missing", () => {
    expect(codes(production({ APP_ENV: "   " }))).toEqual(["identity.missing:APP_ENV"]);
  });

  it("derives development only on a local, non-production-mode run", () => {
    const result = evaluateDeploymentEnvironment({ NODE_ENV: "development" });
    expect(result).toMatchObject({ environment: "development", source: "derived-local", ok: true });
    expect(evaluateDeploymentEnvironment({ NODE_ENV: "test" }).environment).toBe("test");
  });

  it("refuses APP_ENV=production on a Vercel preview deployment", () => {
    expect(codes(production({ VERCEL_ENV: "preview" }))).toContain(
      "identity.platform-mismatch:VERCEL_ENV",
    );
  });

  it("refuses a local identity on a Vercel deployment", () => {
    expect(codes(spark({ APP_ENV: "development" }))).toContain(
      "identity.platform-mismatch:APP_ENV",
    );
  });
});

describe("production fails closed on a missing secret", () => {
  it("accepts a complete production configuration", () => {
    const result = evaluateDeploymentEnvironment(production());
    expect(result.errors).toEqual([]);
    expect(result).toMatchObject({ environment: "production", source: "explicit", ok: true });
  });

  it.each(PRODUCTION_REQUIRED)("refuses production without %s", (name) => {
    expect(codes(production({ [name]: undefined }))).toContain(`production.missing:${name}`);
    expect(codes(production({ [name]: "" }))).toContain(`production.missing:${name}`);
  });

  it("refuses production without a KV pair, and accepts the Upstash names", () => {
    expect(codes(production({ KV_REST_API_TOKEN: undefined }))).toContain(
      "production.missing:KV_REST_API_URL",
    );
    expect(
      codes(
        production({
          KV_REST_API_URL: undefined,
          KV_REST_API_TOKEN: undefined,
          UPSTASH_REDIS_REST_URL: "https://upstash.example.test",
          UPSTASH_REDIS_REST_TOKEN: "fake",
        }),
      ),
    ).toEqual([]);
  });

  it("refuses production pointed at another database or host", () => {
    expect(codes(production({ NEXT_PUBLIC_SUPABASE_URL: `https://${SPARK_REF}.supabase.co` }))).toContain(
      "production.wrong-target:NEXT_PUBLIC_SUPABASE_URL",
    );
    expect(codes(production({ NEXT_PUBLIC_APP_URL: "https://spark.example.test" }))).toContain(
      "production.wrong-target:NEXT_PUBLIC_APP_URL",
    );
  });

  it("reports, but does not block, Stripe test mode in production (live charging is a founder gate)", () => {
    const result = evaluateDeploymentEnvironment(production({ STRIPE_SECRET_KEY: "sk_test_fake" }));
    expect(result.ok).toBe(true);
    expect(result.warnings.map((issue) => issue.code)).toContain("production.stripe-test-mode");
  });

  it("refuses the dev bench and preview map fixtures in production", () => {
    expect(codes(production({ NEXT_PUBLIC_DEV_BENCH: "1" }))).toContain(
      "flag.local-only:NEXT_PUBLIC_DEV_BENCH",
    );
    expect(codes(production({ PREVIEW_MAP_FIXTURES: "1" }))).toContain(
      "flag.preview-only:PREVIEW_MAP_FIXTURES",
    );
  });
});

describe("Spark cannot reach production", () => {
  it("accepts a correctly isolated Spark configuration", () => {
    const result = evaluateDeploymentEnvironment(spark());
    expect(result.errors).toEqual([]);
    expect(result).toMatchObject({ environment: "spark", ok: true });
  });

  it("refuses the production database by URL, connection string or key", () => {
    expect(codes(spark({ NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_REF}.supabase.co` }))).toContain(
      "isolation.production-database:NEXT_PUBLIC_SUPABASE_URL",
    );
    expect(codes(spark({ DATABASE_URL: `postgresql://postgres.${PROD_REF}@pooler.example.test/postgres` }))).toContain(
      "isolation.production-database:DATABASE_URL",
    );
    // The copy-paste case: Spark's URL, production's service-role key.
    expect(
      codes(spark({ SUPABASE_SERVICE_ROLE_KEY: fakeJwt({ role: "service_role", ref: PROD_REF }) })),
    ).toContain("isolation.production-credential:SUPABASE_SERVICE_ROLE_KEY");
    expect(codes(spark({ NEXT_PUBLIC_SUPABASE_ANON_KEY: fakeJwt({ role: "anon", ref: PROD_REF }) }))).toContain(
      "isolation.production-credential:NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  });

  it("refuses live-mode Stripe keys", () => {
    expect(codes(spark({ STRIPE_SECRET_KEY: "sk_live_fake" }))).toContain(
      "isolation.live-payments:STRIPE_SECRET_KEY",
    );
    expect(codes(spark({ STRIPE_SECRET_KEY: "rk_live_fake" }))).toContain(
      "isolation.live-payments:STRIPE_SECRET_KEY",
    );
    expect(codes(spark({ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_fake" }))).toContain(
      "isolation.live-payments:NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    );
  });

  it("refuses the production Clerk instance, including a test-prefixed key for the production domain", () => {
    expect(codes(spark({ CLERK_SECRET_KEY: "sk_live_fake" }))).toContain(
      "isolation.production-auth:CLERK_SECRET_KEY",
    );
    expect(
      codes(spark({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: clerkPk("test", PRODUCTION_FINGERPRINT.clerkFrontendApiHost) })),
    ).toContain("isolation.production-auth:NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  });

  it("refuses the production analytics project and the production host", () => {
    expect(codes(spark({ NEXT_PUBLIC_POSTHOG_KEY: PRODUCTION_FINGERPRINT.posthogProjectKey }))).toContain(
      "isolation.production-analytics:NEXT_PUBLIC_POSTHOG_KEY",
    );
    expect(codes(spark({ NEXT_PUBLIC_APP_URL: "https://www.exploreandearn.com/" }))).toContain(
      "isolation.production-url:NEXT_PUBLIC_APP_URL",
    );
  });

  it("refuses a Spark with no app URL, because 14 call sites would fall back to production", () => {
    expect(codes(spark({ NEXT_PUBLIC_APP_URL: undefined }))).toContain("spark.missing:NEXT_PUBLIC_APP_URL");
  });

  it("refuses a Spark with no database of its own", () => {
    expect(codes(spark({ NEXT_PUBLIC_SUPABASE_URL: undefined }))).toContain(
      "spark.missing:NEXT_PUBLIC_SUPABASE_URL",
    );
  });

  it("refuses any outbound email, push or notification sending", () => {
    expect(codes(spark({ RESEND_API_KEY: "re_fake" }))).toContain("spark.outbound:RESEND_API_KEY");
    expect(codes(spark({ VAPID_PRIVATE_KEY: "fake" }))).toContain("spark.outbound:VAPID_PRIVATE_KEY");
    expect(codes(spark({ NOTIFICATION_ENGINE_STAGE: "internal" }))).toContain(
      "spark.outbound:NOTIFICATION_ENGINE_STAGE",
    );
    expect(codes(spark({ NOTIFICATION_ENGINE_STAGE: "disabled" }))).toEqual([]);
  });

  it("refuses the dev bench on a deployed Spark", () => {
    expect(codes(spark({ NEXT_PUBLIC_DEV_BENCH: "1" }))).toContain("flag.local-only:NEXT_PUBLIC_DEV_BENCH");
  });
});

describe("preview and local runs are held to the same isolation", () => {
  it("refuses a preview pointed at the production database", () => {
    const preview = spark({
      APP_ENV: "preview",
      VERCEL_ENV: "preview",
      NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
    });
    expect(codes(preview)).toContain("isolation.production-database:NEXT_PUBLIC_SUPABASE_URL");
  });

  it("allows preview-only map fixtures on a preview", () => {
    const preview = spark({ APP_ENV: "preview", VERCEL_ENV: "preview", PREVIEW_MAP_FIXTURES: "1" });
    expect(codes(preview)).toEqual([]);
  });

  it("refuses a local dev run holding a production service-role key", () => {
    expect(
      codes({
        NODE_ENV: "development",
        SUPABASE_SERVICE_ROLE_KEY: fakeJwt({ role: "service_role", ref: PROD_REF }),
      }),
    ).toEqual(["isolation.production-credential:SUPABASE_SERVICE_ROLE_KEY"]);
  });
});

describe("the report is safe to print", () => {
  it("never echoes a variable's value", () => {
    const secret = "sk_live_DO_NOT_PRINT_ME";
    const result = evaluateDeploymentEnvironment(
      spark({ STRIPE_SECRET_KEY: secret, RESEND_API_KEY: "re_DO_NOT_PRINT_ME" }),
    );
    const printed = JSON.stringify(result);
    expect(result.ok).toBe(false);
    expect(printed).not.toContain("DO_NOT_PRINT_ME");
  });
});
