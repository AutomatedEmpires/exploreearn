# Repository Audit: Explore&Earn (independent verification)

**Date:** 2026-11-02
**Baseline:** `origin/main` @ `732f300` (2026-08-10, "fix: simplify discovery card details (#340)")
**Branch:** `claude/serene-franklin-kni5s1`
**Method:**
- Ran everything myself on a clean container: 4 cores, 15 GB RAM, Node 24.16.0, pnpm 10.12.4.
- Unshallowed the clone to measure real history.
- All sizes come from git objects, so anyone can reproduce them (`inventory.json`).
- I did not accept the previous audit's findings as given. Where earlier docs made a claim, I re-measured it.

**Companion documents:**
- [BLOAT_INVENTORY](./BLOAT_INVENTORY.md)
- [CLEANUP_MANIFEST](./CLEANUP_MANIFEST.md)
- [ARCHITECTURE_RECOVERY_PLAN](./ARCHITECTURE_RECOVERY_PLAN.md)
- [SPARK_PRODUCTION_ISOLATION](./SPARK_PRODUCTION_ISOLATION.md)
- [LOCAL_DEVELOPMENT_READINESS](./LOCAL_DEVELOPMENT_READINESS.md)
- [`inventory.json`](./inventory.json)
- [`branches.tsv`](./branches.tsv)

---

## 1. Findings at a glance

| # | Finding | Severity | Status |
|---|---|---|---|
| F1 | **`main` has been red since 2026-09-01.** A test compared a fixed "future" date (2026-09-01) to the real clock. Every Dependabot PR since 2026-09-13 fails only at the Test step. | **High** | **Fixed** (S4) |
| F2 | 86.6% of the tracked tree (137.9 MB) is `docs/`, nearly all design-reference PNGs. **57.0 MB of that is a byte-identical duplicate folder.** | High (DX) | **Fixed** (S1): tree 159.25 → 102.26 MB |
| F3 | Git history (94.4 MiB) is ~92% blobs that are *still at the tip*; only 3.3 MiB is history-only. Removing files does not shrink a full clone, but a blobless + sparse clone gives a **42 MB** checkout today. | Info | Documented, with a lean-clone recipe |
| F4 | The earlier production-build "crash" was **memory exhaustion**, not a compile error. Peak ~5.65 GB, against an 8 GB WSL default shared with the editor. A separate **non-deterministic** failure comes from `next/font/google` fetching at build time. | Med | Root-caused. Mitigation is documented; font self-hosting is planned (A7). |
| F5 | **No Spark/production isolation exists.** There is one Supabase project (production, formerly labelled "staging"). Previews run `NODE_ENV=production`. 14 call sites fall back silently to the production URL. | **High** before any Spark launch | Stage 1 implemented (rules, tests, CLI). Stages 2–6 are planned and founder-gated. |
| F6 | Missing secrets degrade silently: no KV gives per-instance rate limits, no Resend drops email, `NOTIFICATION_SIGNING_SECRET` falls back to `CRON_SECRET`. 16+ env vars the code reads are undocumented. | Med | Planned (A2/A3) |
| F7 | No guard against re-accumulating binaries. | Med | **Fixed** (S2 `.gitignore` + S3 guardrail G55) |
| F8 | 61 remote branches; 11 provably merged or empty; 6 open Dependabot PRs, all red because of F1. | Low | Classified (`branches.tsv`); deletion needs a founder decision |
| F9 | Auth, RLS and Stripe entitlement architecture is **sound**. There are a handful of low and medium hardening items. | Info | Planned (A4–A6) |
| F10 | **Tests could pass against stale code.** `tsc -b` emitted `index.js` into `packages/mailer/src/` (and 2 more packages), those emits were committed, and the mailer test imported `../index.js`. A run without a prior typecheck tested stale JS. | Med | **Fixed** (S6) |
| F11 | ~280 KB / 75 files of dead code (19 files of superseded legacy demo). 9 alias demo routes. 2,964 redundant CSS rule instances. 323 raw `<button>`s against a `Button` primitive. Three dialog systems. | Med (maintainability) | Planned (B2–B8) |

## 2. Size and history (Phase 1.1–1.2)

| Metric | Value |
|---|---|
| Tracked files / bytes (before) | 1,973 / **159.25 MB** |
| Tracked files / bytes (after) | 1,956 / **102.26 MB**, including the new reports |
| Tracked binary (before → after) | 145.59 MB (115 files) → 88.62 MB (94 files) |
| Commits on `main` / all refs | 548 / 771 |
| Remote branches / tags | 61 / 0 |
| Pack size, all refs | 94.4 MiB. Tip blobs are 87.3 MiB; history-only blobs are 3.3 MiB. |
| Reference PNGs in history | 29 unique blobs, 75.4 MiB |
| Local-only disk | `node_modules` 1.2 GB; `apps/web/.next` 2.2 GB after a build |
| Largest files | The 29 `ui-ideas-2/*.png` (2.0–3.6 MB each). The largest app asset is a 0.50 MB WebP. |

Details are in BLOAT_INVENTORY.

## 3. Duplicates and asset references (Phase 1.3–1.4)

- **30 exact-duplicate groups** (by git blob SHA, cross-checked with SHA-256).
- 21 of them are the `ui-ideas` ≡ `ui-ideas-2` PNG pairs, totalling 56.98 MB.
- The rest are 9 tiny CSS modules or configs (2 KB) and 7 empty stubs.
- **Design references are not referenced by any code, test, guardrail or CI.** They are founder design intent, and only their READMEs cite them.
- **Product photos** are referenced through a licensed catalog (`public/photos/manifest.json`). 24 of 30 slugs are used in code; the other 6 are catalog data.

## 4. Validation baseline (Phase 1.6)

| Check | `main` before | This branch |
|---|---|---|
| `pnpm install --frozen-lockfile` | ✅ 14 s | ✅ |
| `pnpm typecheck` (`tsc -b`) | ✅ 52 s | ✅ |
| `pnpm lint` | ✅ 0 errors / 2,227 warnings (all i18n `no-untranslated-jsx-text`) | ✅ same |
| `pnpm guardrails` (15 checks) | ✅ | ✅ (16 checks, with G55) |
| `apps/web` vitest | ❌ **1 failed** / 2,726 passed (150 files) | ✅ **2,764 passed** (151 files) |
| `packages/db` vitest | ✅ 1,131 passed, 23 skipped | ✅ |
| `packages/mailer`, `packages/stripe-seed` | ✅ 18, 29 | ✅ |
| `pnpm build` (apps/web) | ✅ 2 of 3 runs. 1 run failed in `next/font/google` (network, §5.2). | ✅ (identical source) |
| Web suite with the clock shifted +365 days | — | ✅ 2,727/2,727. No other date bombs. |
| `pnpm test:e2e`, `db-assert` SQL against a live DB | not run (needs browsers and services) | not run |
| CI on `main` | Last run 2026-08-10, green. Every PR run since 2026-09-13 is red at **Test** only; Install, Typecheck, Lint, Guardrails and Build all pass. | This PR's CI is the confirmation. |

## 5. Phase 5 investigations

### 5.1 Founding-host checkout test failure: root cause

`tests/unit/founding-host-program.test.ts > startHostCheckoutAction … carries the discount only when the row says a place is claimable` fails with `createCheckoutSession` called 0 times.

**Cause:**
- The fixture row's deadline is `FUTURE = "2026-09-01T12:00:00.000Z"`.
- `startHostCheckoutAction` calls `resolveFoundingProgramView(await getFoundingHostProgram())` with **no clock argument** (`app/actions/hostBilling.ts:243`), so it evaluates against `new Date()`.
- Since 2026-09-01 that deadline is in the past. The action correctly refuses with `founding_unavailable` and never opens checkout.

**The product code is right.** Refusing an expired programme is exactly what the file's own doc comment requires. The test was a time bomb, written 2026-07-27. Worse, the "REFUSES a discounted checkout against a passed deadline" cases were **passing for the wrong reason**, because every fixture had become past.

**How it was proven:**
- Running the unfixed test with the real clock gives 1 failure.
- Running it with the clock shifted back 100 days (via a Node `--import` preload, not committed) gives 21/21 passing.

**Fix:** `vi.useFakeTimers({ toFake: ["Date"] })` plus `vi.setSystemTime(NOW)` for the checkout block, restored in `afterEach`. Only `Date` is faked, so awaited promises still resolve.

### 5.2 Production-build crash: resource exhaustion vs compilation

**It is resource exhaustion, not a compilation failure.**
- A clean build peaks at **5.65 GB above idle** (p95 5.28 GB), measured every second across the whole system.
- WSL2 on a 16 GB laptop defaults to 8 GB, shared with the editor and TS server.
- 2 of 3 builds compiled all routes in 3.0–3.1 minutes. CI's Build step passes on 16 GB runners.
- The earlier handoff observations ("`origin/main` OOMs identically", "`next dev` crashes on ~8 GB") match.

**A distinct, real build fragility:**
- One build failed in `next/font/google` (`loader.js:122`, `Cannot read properties of null (reading '1')`). That happens when the Google Fonts CSS response contains a font URL without a recognised extension.
- I instrumented the loader temporarily (in `node_modules` only, restored byte-identical). The rebuild passed and the diagnostic never fired, and the same fetch run in isolation returned valid `.woff2` URLs three times.
- So the build depends on a network fetch that can return unexpected content. **Offline builds cannot succeed.** Recommendation: A7 (`next/font/local`).

### 5.3 Functional preservation

This PR does not change any of the following:
- production source under `apps/web/app`, `components`, `services` or `packages/*/src`;
- migrations;
- auth, RLS or Stripe logic;
- routes, SEO metadata or the a11y baseline.

The only changed `apps/web` files are one test, one new unused `lib/deployment` module and one new test. In `packages/`, only tsconfig `outDir`, one test import and untracked build artifacts changed (S6), and the build output is unchanged. Marketplace flows (seeker, host, admin, billing, maps, listings, profiles, applications) are preserved, and so is their test coverage (2,764 web tests, 1,131 db tests).

## 6. What this audit does *not* establish

- **The application is not production-ready just because unit tests pass.**
- Not verified here:
  - e2e flows;
  - the db-assert SQL suite against a real database;
  - webhooks end to end;
  - the 8 unapplied migrations 058–065 (a founder pipeline item, still outstanding);
  - live-payment readiness (Stripe still in test mode);
  - notification sending (gated);
  - CSP still report-only.
- There is no Spark environment yet (F5).

## 7. Branch topology, protection and deployment (Phase 1.7)

- **`main`:** default branch. CI runs on push, PR and merge_group through `AutomatedEmpires/.github/.github/workflows/reusable-ci.yml@main` (not readable from this session). Merging auto-deploys to production via Vercel (AGENTS.md).
- **Merges:** squash, so ancestry under-reports what is merged. `branches.tsv` therefore uses a **content verdict**: 7 `content-in-main`, 5 `empty` (including this branch's base), 48 `diverges`.
- **Open PRs:** 6, all Dependabot: #341 vitest, #342 sharp, #343 next 15.5.24, #346/#347 MCP SDK (duplicates), #348 Sentry.
- **Branch protection:** I could not read the ruleset from this session. `docs/ci/branch-protection-and-review-governance.md` documents the intent.
- **Workflows (11):**
  - `ci`, `codeql`
  - `db-migrate` (applies to **production** Supabase)
  - `db-security`, `migration-guard`
  - `claude-code`, `codex-review`
  - `pr-agent-dispatch`, `pr-agent-router`, `agent-build-task-router`
  - `release`

## 8. Architecture (Phase 1.8 and Phase 3)

Summary only; detail and the staged plan are in ARCHITECTURE_RECOVERY_PLAN.

- **Auth (Clerk):**
  - Middleware fails closed. Admin is a single `ADMIN_CLERK_USER_ID`, checked in the layout and again in every action.
  - Every mutating server action reaches `auth()`. The one exception is the rate-limited, PII-free source-click counter.
  - Route handlers: cron routes use constant-time secret checks; Clerk (Svix), Resend (HMAC) and Stripe webhooks are all signature-verified.
- **Supabase:**
  - 66 tables; **66/66 have RLS enabled**, with 138 policies. 17 tables are service-role-only (RLS on, no policy) and are reached via `adminClient` after app-level auth.
  - The service-role client sits behind `server-only` modules, and client components import the DB package type-only.
- **Stripe:**
  - Webhook signatures are verified. Entitlements have a single authority (`host_subscriptions`, with a SQL resolver).
  - Three optional price ids fall back to inline prices (documented as intentional). Invite-pack ids are undocumented.
- **CSS and components:**
  - 268 CSS files. 252 stylesheets reference the spacing scale.
  - Guardrails G50–G54 already ratchet raw colours and token use (22,373 `var()` refs across 1,189 files resolve).
  - Byte-identical modules: C5. Duplicated selectors and component boundaries: ARCHITECTURE_RECOVERY_PLAN §2.
