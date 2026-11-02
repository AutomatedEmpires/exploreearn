# Spark / Production Isolation

**Status:** design + stage 1 implemented (rules, tests, CLI). Nothing is wired into the runtime or the build, and nothing has been deployed. · **Date:** 2026-11-02

**Spark** is an isolated environment for demonstrations and previews. **Production** is real users, accounts, payments, listings and marketplace operations. This document explains why the two are not isolated today, the rules that will isolate them, and the stages for getting there safely.

---

## 1. Why isolation does not exist today (evidence)

| # | Fact | Evidence |
|---|---|---|
| 1 | **There is exactly one hosted Supabase project, and it is production.** It was provisioned as "staging" and later promoted, so older docs still call it staging. | `docs/audit/INTEGRATIONS_STATE.md:44` lists `SUPABASE_PROJECT_REF_STAGING=mamosbzcbigcclafhmmr`. `docs/runbooks/db-migrations-ci.md:6` and `.github/workflows/db-migrate.yml:1-11` call the same ref the **production** project. |
| 2 | Previews build with `NODE_ENV=production`, so the code cannot tell a preview from production. | `VERCEL_ENV` is read in only two places: the Sentry environment tag (`instrumentation.ts:11`) and the map-fixture flag (`components/discovery/data.ts:36-39`). |
| 3 | Isolation depends entirely on Vercel scoping variables per environment. No code checks `sk_live_`, Stripe `livemode`, or which database it is talking to. | Grep finds no `livemode` or `sk_live` check in `apps/web`. |
| 4 | **14 call sites fall back silently to the production URL**, including Stripe success/cancel URLs and email links. | `NEXT_PUBLIC_APP_URL?.replace(...) \|\| "https://exploreandearn.com"`, e.g. `app/actions/hostBilling.ts:65`, `services/stripe/index.ts:1151`, `lib/email.ts:79`. |
| 5 | Several missing secrets degrade without any signal. | With no KV, rate limiting becomes in-memory per instance (`lib/rateLimit.ts:114-120`). With no `RESEND_API_KEY` in production, email is dropped with only a `console.error` (`packages/mailer/src/index.ts:190-211`). `NOTIFICATION_SIGNING_SECRET` falls back to `CRON_SECRET` (`services/notifications/unsubscribe.ts:36-41`). |
| 6 | Production's public identifiers are committed in docs, so they are easy to copy-paste into a preview config. | The production anon JWT (decoded `role: anon`, `ref: mamosbzcbigcclafhmmr`) and the PostHog project key are in `docs/audit/INTEGRATIONS_STATE.md`. Both are **public by design** (shipped to browsers, with RLS protecting the data), so this is **not a secret leak**, only a copy-paste hazard. |
| 7 | The demo routes (`/for-hosts/demo`, `/for-seekers/demo`) already avoid the database and analytics. They are built from static fixtures with type-only DB imports, and the live `full-fidelity` demo calls no `captureEvent`. | `grep captureEvent components/demo/full-fidelity app/[locale]/for-*/demo` returns nothing. The `demo_*` events are only in dead legacy components (ARCHITECTURE_RECOVERY_PLAN B2). |

**Consequence.** A Spark deployment assembled by copying production's variables would:
- write to the production database;
- send real email;
- track into production analytics;
- send Stripe returns to `exploreandearn.com`.

It would do all of this without raising a single error.

What already works well, and should be kept:
- The dev bench cannot run in a production build (`lib/devBench/index.ts:43-48`, guardrail `check-dev-bench.mjs`).
- Middleware fails closed without Clerk keys (`middleware.ts:272-283`).
- PostHog config is validated fail-closed (`tools/scripts/check-posthog-env.mjs`).
- The notification engine defaults to `disabled` (`services/notifications/stage.ts:60-63`).

## 2. Target architecture

```
                       ┌──────────── PRODUCTION ────────────┐   ┌───────────── SPARK ──────────────┐
Vercel project         explore-and-earn (prod)               │   explore-and-earn-spark (separate)
APP_ENV                production                            │   spark
Supabase               mamosbzcbigcclafhmmr                  │   NEW dedicated project (seeded demo data)
Clerk                  production instance (pk_live_)        │   separate development instance (pk_test_)
Stripe                 live (after founder gate) / test now  │   test mode only, or unset
Resend / VAPID push    configured                            │   UNSET — no real inbox or device
Notification engine    founder-controlled stage              │   unset / "disabled"
PostHog                project 291166                        │   unset, or a dedicated non-prod project
Sentry                 environment=production                │   environment=spark
NEXT_PUBLIC_APP_URL    https://exploreandearn.com            │   its own host (required)
Doppler config         prd                                   │   spark
```

Rules for the shape above:
- Spark is its own **Vercel project**, not a preview branch of production. That way no production-scoped variable can be inherited.
- Preview deployments of the production project follow the same isolation rules as Spark.

## 3. The rules (implemented)

Source: `apps/web/lib/deployment/environmentIsolation.ts`. Tests: `apps/web/tests/unit/environment-isolation.test.ts` (37 tests). The tests were mutation-checked: disabling the live-Stripe rule fails 1 test, and disabling the Spark rules fails 3.

1. **Identity is explicit.**
   - `APP_ENV` must be one of `production | spark | preview | development | test`.
   - It is **required** on any Vercel deployment or any `NODE_ENV=production` run.
   - It is never inferred. Blank counts as missing, and unknown values are refused.
   - Only a local, non-production-mode run may derive `development`/`test`.
2. **The platform must agree with `APP_ENV`.**
   - `production` is valid only on `VERCEL_ENV=production`.
   - `preview` is never valid on a Vercel production deployment.
   - `development`/`test` are never valid on Vercel.
   - `spark` may run on its own project's production deployment.
3. **No non-production identity may reach production.** Each of the following is refused:

   | Check | Variables |
   |---|---|
   | Production Supabase project | `NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_URL`, the JWT `ref` claim of `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
   | Live-mode Stripe keys | `sk_live_`, `rk_live_`, `pk_live_` |
   | Production Clerk instance | `sk_live_`, `pk_live_`, or a key whose encoded frontend API is `clerk.exploreandearn.com` |
   | Production PostHog key | `NEXT_PUBLIC_POSTHOG_KEY` |
   | Production app host | `NEXT_PUBLIC_APP_URL` |
4. **Spark is send-nothing.**
   - Refused: `RESEND_API_KEY`, `VAPID_PRIVATE_KEY`, and any `NOTIFICATION_ENGINE_STAGE` other than `disabled`.
   - **Required:** `NEXT_PUBLIC_APP_URL` (so the 14 fallbacks can never fire) and `NEXT_PUBLIC_SUPABASE_URL`, which must be a non-production project.
5. **Production fails closed.**
   - Every name in `PRODUCTION_REQUIRED` must be present and non-blank, plus a KV/Upstash URL and token pair.
   - Supabase and the app host must be production's own.
   - Stripe test mode is a **warning, not an error**, because live charging is a founder approval gate.
6. **Switches that must stay off where they don't belong.**
   - `NEXT_PUBLIC_DEV_BENCH` is refused on any deployment.
   - `PREVIEW_MAP_FIXTURES` is refused anywhere except `APP_ENV=preview`.
7. **Reports never echo values.** This is tested by planting values in the config and asserting none of them appear in the output.

The production fingerprint (Supabase ref, app hosts, Clerk frontend-API host, PostHog project key) is made of **public** identifiers only.

## 4. Staged rollout, with acceptance criteria

| Stage | Change | Deploy-affecting? | Acceptance criteria |
|---|---|---|---|
| **1 (done, this PR)** | Rule set, tests and CLI (`tools/scripts/check-environment-isolation.mjs`). | No | 37 tests pass. The CLI exits 1 on a Spark copied from production and prints no values. Typecheck and lint are clean. |
| **2 Validate** | Run the CLI against every real config: Doppler `prd`, Vercel Production, Vercel Preview, and the future Spark. Use `doppler run --config <c> -- node tools/scripts/check-environment-isolation.mjs`. | No (read-only) | Production passes, apart from stage-0 gaps you choose to accept. **Preview is expected to fail today** with `isolation.production-database`, because only one Supabase project exists. That result is the finding, not a bug. |
| **3 Provision Spark** *(founder)* | Create a Supabase Spark project and apply migrations to it, not to production. Create a Clerk dev instance, a Stripe test account and a Vercel Spark project. Set `APP_ENV=spark`, its own `NEXT_PUBLIC_APP_URL` and Doppler config `spark`. Seed it with demo fixtures. | Yes (new resources only, production untouched) | `doppler run --config spark -- node tools/scripts/check-environment-isolation.mjs` exits 0. |
| **4 Wire fail-closed** | Call `evaluateDeploymentEnvironment(process.env)` in `instrumentation.ts` `register()` on the Node runtime, and throw when `!ok`. Run the CLI as a Vercel build step before `next build`. | **Yes**: a misconfigured environment stops deploying | Set `APP_ENV` in every Vercel environment first. A preview deploy without `APP_ENV` fails the build. A Spark deploy holding `sk_live_` fails the build. Production deploys unchanged. |
| **5 Remove the fallbacks** | Replace the 14 `\|\| "https://exploreandearn.com"` sites with one `appUrl()` helper that throws when unset outside development. Same treatment for the `NOTIFICATION_SIGNING_SECRET → CRON_SECRET` fallback and the silent in-memory rate-limit fallback in production. | Yes | Grep finds no production-URL literal outside the helper and SEO metadata. Tests cover the throw. |
| **6 Point previews at Spark data** | Production-project previews use the Spark Supabase project, not production. | Yes | The stage-2 CLI run against Vercel Preview passes. |

**Do not start stage 4 until stage 2 is clean for production**, otherwise the first deploy after wiring will refuse to start. Stages 3–6 change credentials and deployments, so each is a founder approval gate (AGENTS.md §4, "permissions", "public launch/deploy").

## 5. Tests verifying isolation

- **Today:** `apps/web/tests/unit/environment-isolation.test.ts`. It runs in `pnpm test` and CI. It covers identity, platform agreement, every production-reach vector, Spark outbound refusal, production required secrets, local-only flags, and no value echo.
- **Stage 4 adds:** a test asserting that `instrumentation.ts` refuses to register with `ok: false`.
- **Stage 5 adds:** a ratchet guardrail (G56) that counts production-URL literals and may only tighten.
