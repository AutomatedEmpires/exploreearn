# Architecture Recovery Plan

**Principle:** repair, don't restart. Every item below is a measurable problem with evidence. High file, route or migration counts are **not** treated as defects on their own. Each stage is a separate PR. Each must pass `pnpm typecheck && pnpm lint && pnpm guardrails && pnpm test && pnpm build`, and any UI-touching stage also needs a 380 px + 1024 px render check (CLAUDE.md). · **Date:** 2026-11-02

---

## 1. What is sound (keep; do not "fix")

| Area | Evidence |
|---|---|
| Auth boundary | Middleware fails closed (`middleware.ts:272-283`, `:311`, `:368`). Admin is checked in the layout (`(admin)/layout.tsx:61-63`) and again in every action (`actions/admin.ts:30`). A trace of all 45 action files found no unauthenticated mutation of user data. |
| Webhooks | Stripe uses `constructEvent` (`services/stripe/index.ts:1812-1820`). Clerk uses Svix (`webhooks/clerk/route.ts:246`). Resend uses HMAC with a ±5-minute window and returns 503 when unconfigured. Cron routes use a constant-time bearer check (`lib/cronAuth.ts:9-16`). |
| RLS | 66/66 tables have RLS enabled, with 138 policies. 17 are service-role-only by design. The service-role client is only importable from `server-only` modules, and client components import `@explore-and-earn/db` type-only. |
| Entitlements | A single authority: `host_subscriptions` plus the resolver `host_subscription_tier_for_clerk_user` (`083_entitlement_enforcement.sql:292`). Checkout re-authorises the founding rate and never falls back to full price (`services/stripe/index.ts:1098-1103`). |
| Design-system enforcement | Guardrails G22, G30, G50–G54 are ratchets that already hold the line on tokens, raw colours, icons, locale literals and the Verified-Host badge. |
| Dev bench | Cannot run in a production build. Its privileged mode also requires a local Supabase URL. |

## 2. Measured problems, with a staged plan

The dependency order matters: **A1 → A2 → (A3 ∥ A7) → A4/A5/A6 → B-items**.

| ID | Problem (evidence) | Stage / change | Depends on | Acceptance criteria |
|---|---|---|---|---|
| **A1** | `main` CI red since 2026-09-01 (date-dependent test). | **Done in this PR** (S4). | — | `pnpm test` is green. This PR's CI is green. |
| **A2** | No environment identity. Previews equal production at runtime. 14 silent production-URL fallbacks (`hostBilling.ts:65`, `services/stripe/index.ts:1151`, `lib/email.ts:79`, …). | SPARK_PRODUCTION_ISOLATION stages 2→6. Stage 1 (rules, tests, CLI) is done here. | — | See that document §4. Finishes with zero production-URL literals outside one `appUrl()` helper and SEO metadata. |
| **A3** | No env schema. Undocumented reads: KV/Upstash ×4, `STRIPE_PRICE_FOUNDING_*` ×6, `STRIPE_PRICE_INVITE_PACK_*` ×3, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_APP_VERSION`. Documented but no reader: `ANTHROPIC_API_KEY` (the code reads `AI_GATEWAY_API_KEY`) and 5 others. The two `.env.example` files disagree. | Generate one manifest (`docs/source-of-truth/env-manifest.json`) from a static scan. Add guardrail G57: every `process.env.X` read is in the manifest, and every manifest entry has a reader or an `external: true` tag. Collapse to a single `.env.example`. | — | G57 is in `pnpm guardrails`. Removing any documented name, or adding an undocumented read, fails CI. |
| **A4** | Silent degradation in production. No KV makes the rate limiter fall back to per-instance memory (`lib/rateLimit.ts:114-120`), while listing decisions *fail closed* (`lib/listingDecisionLock.ts:174-181`). No `RESEND_API_KEY` drops email with only a `console.error` (`packages/mailer/src/index.ts:190-211`). `NOTIFICATION_SIGNING_SECRET` falls back to `CRON_SECRET` (`services/notifications/unsubscribe.ts:36-41`). The two KV readers treat `""` differently (`??` vs `\|\|`). | Extend `/api/health` with a config section (names only) driven by `PRODUCTION_REQUIRED`. Unify KV resolution in one helper. Drop the signing-secret fallback in production. | A2 stage 2 (know what production actually has) | `/api/health` reports `config: degraded` for any missing required name. The unit test covers each fallback's removal. |
| **A5** | Stripe webhook classifies "bad signature" by `error.message.includes("signature")` (`api/webhooks/stripe/route.ts:74`). A processing error whose message contains "signature" returns 400 and is never reported. | Use `instanceof Stripe.errors.StripeSignatureVerificationError`. | — | A unit test with a non-signature error containing "signature" expects 500 plus Sentry. |
| **A6** | The Clerk webhook builds its own service-role client (`webhooks/clerk/route.ts:38-54`). `packages/db/src/adminClient.ts` has no `import "server-only"` of its own. | Use the shared `adminClient()`. Add `server-only` to `adminClient.ts`. | — | Grep finds no `createClient(` with the service key outside `packages/db/src`. Typecheck and build pass. |
| **A7** | The build fetches Google Fonts over the network (`app/layout.tsx:4`). One of 3 local builds failed non-deterministically at `@next/font/dist/google/loader.js:122`, and offline builds are impossible. | Self-host Manrope with `next/font/local`, using a variable woff2 (latin subset, about 50 KB, under G55's budget) and the same `--font-manrope` variable. | — | `pnpm build` passes with outbound network blocked. Visual diff at 380/1024 px shows no change. |
| **A8** | Optional Stripe price ids fall back to inline `price_data` for boost (`services/stripe/index.ts:1206-1220`), invite packs (`:1402-1410`) and additional listings (`:1311`). That fallback is documented as intentional for boost and additional listings; invite packs are undocumented. | Document the invite-pack ids (A3). In production, log a Sentry breadcrumb when the inline fallback is used. | A3 | Inline-price use is observable in production. Docs list all 3 invite-pack ids. |
| **A9** | ~~Demo routes send PostHog events into production.~~ **Withdrawn after verification.** The live demo (`components/demo/full-fidelity/**`, `for-hosts/demo`, `for-seekers/demo`) emits **no** analytics events. The `demo_*` captures exist only in the dead legacy demo components (`DemoSession.tsx:110`, `ProductTour.tsx:225`, …; see B2). | None for production. Spark analytics isolation is covered by A2 (`isolation.production-analytics`). | — | — |
| **A10** | The admin role is a single env-var user id (`lib/admin.ts:14-28`). That makes for a bus factor of one and no audit trail. | Founder decision: keep it (documented) or move to a comma-separated list or a Clerk org role. | Founder | The decision is recorded in `docs/source-of-truth/`. |
| **A11** | `recordSourceClickAction` is the only unauthenticated mutating server action (rate-limited 30/min per IP, no PII) (`actions/sourcedAnalytics.ts:22-40`). | Add a guardrail test asserting the unauthenticated-mutation allow-list is exactly this one action. | — | A new unauthenticated mutating action fails the test. |
| **A12** | Dev-bench comments say `isDevBenchPrivileged()` governs the middleware bypass, but the code checks `isDevBenchEnabled()` (`lib/devBench/index.ts:82` vs `middleware.ts:300,332,358`). It is safe in practice, because production builds are excluded. | Make the comment match the code, or require privileged mode for the bypass. | — | Comment and code agree, with a test pinning the bypass condition. |

## 3. Routing, components, CSS, dead code (static analysis)

The method was symbol-aware import reachability from every production entry point: `app/**`, middleware, instrumentation, `next.config.ts` aliases, `scripts/` and `tools/`. Each claim marked ✔ was independently re-verified. One claim from the first pass was **refuted** and has been withdrawn (A9).

### 3.1 Inventory

| Area | Measured |
|---|---|
| Routes | **155** `page.tsx`, 20 `route.ts`, 19 `layout.tsx`. By group: `for-seekers/demo` 31, `(seeker)` 28, `for-hosts/demo` 27, `(host)` 20, `(admin)` 16, `(legal)` 8, onboarding 4+4, `(dev)` 2, `(auth)` 2, public ≈12. |
| Demo surface | **58 public demo pages (37% of routes)**. These are deliberate marketing walkthroughs: `robots: noindex` (`for-hosts/demo/layout.tsx:17`), static fixtures, no analytics. Each is a 5–17 line wrapper over `full-fidelity` views. **Not a defect in itself.** |
| Gated surfaces | `(dev)/dev*` returns `notFound()` unless the dev bench is on (`dev/page.tsx:22`, guardrail `check-dev-bench.mjs`). `admin/email-preview*` re-checks `isAdminUserId`. ✔ |
| CSS | 258 CSS modules (1.44 MB), plus 7 global stylesheets (142 KB: `tokens` 42.7, `primitives` 32.7, `host-os` 19.0, `host` 17.0, `seeker-os` 13.6, `admin-os` 12.2, `palettes` 5.0), plus 1 stray global (`components/shell/shell.css`). 8,246 rules; **713 declaration blocks repeat across files, for 2,964 redundant rule instances.** |
| `ui-*` primitives | 70 classes, each defined **once**, in `styles/primitives.css`. About 30 are never used by any TSX (`ui-field`, `ui-input`, `ui-label`, `ui-stat*`, `ui-empty*`, …), while `.input`, `.field` and `.label` are re-declared in 24, 23 and 35 modules. That is an **adoption gap**, not dead CSS (`docs/design/component-rules.md` prescribes them). |
| Buttons | **323 raw `<button>`** across about 105 files ✔, against 117 `<Button>` usages in 40 files. |
| Dialogs | `Modal` primitive: 2 users. `components/overlay/PopupShell.tsx`: 17 importers. 11 more components hand-roll `role="dialog"`. |
| Dead code | **75 files / ~280 KB unreachable** from production entry points (list in §3.3). |

### 3.2 Staged consolidation

| ID | Problem | Change | Depends on | Acceptance criteria |
|---|---|---|---|---|
| **B1** | **Committed build output in package `src/`.** `tsc -b` emitted `index.js`/`.d.ts` beside the source, and `mailer`'s test imported `../index.js`, so vitest ran the *emitted* file. `db/src/types.gen.d.ts` (139 KB, June) had drifted from `types.gen.ts` (104 KB). ✔ (proven by poisoning each file) | **Done in this PR** (S6): `outDir: ./dist` for 3 packages, 8 artifacts untracked, test imports the source. | — | `tsc -b` writes nothing into `src/`. A `throw` appended to `index.ts` fails the mailer suite. |
| **B2** | **Legacy demo is dead: 19 files / ~104 KB.** `components/demo/{DemoAnalyticsWorkspace, DemoAnnouncementList, DemoApplicantWorkspace, DemoBanner, DemoListingsLive, DemoMessages, DemoOutreach, DemoOverviewLive, DemoOverviewPanels, DemoPeople, DemoSeekerPreview, DemoSession, DemoSurfaceHeader, DemoToolbar, DemoWeatherPanel, DemoWorkspaceNav, ProductTour(.module.css), tourStops}`. It was superseded by `demo/full-fidelity`. The only barrel consumer imports `DemoJobCard` (`for-hosts/HostMarketingPage.tsx:16`). ✔ | Delete in one PR. Prune `components/demo/index.ts`, `enterpriseDemo.ts` (2,838 lines, partly dead) and `demoChrome.module.css` (47.6 KB) down to what the live files use. | — | Source-reading tests updated in the same PR (`enterprise-demo-fixtures.test.ts:370`, `demo-isolation.test.ts:92`). The reachability script reports no demo files. Build passes. |
| **B3** | **9 alias demo routes render the same view as a canonical route.** Seeker: `demo`=`demo/home`, `applied`=`applications`, `applied/[id]`=`applications/[id]`. Host: `dashboard`=`analytics`, `billing`=`plan` ✔, `coach`=`help`, `location`=`profile/location`, `team`=`profile/team`, plus the legacy `job`. | Replace with `redirects()` (308) in `next.config.ts`, which already uses the pattern at lines 124-140. Repoint links (`demoRoutes.ts:21,23,37`, `enterpriseDemo.ts:2775-2803`, `HostMarketingPage.tsx:179,427,480`, `(host)/host/listings/page.tsx:118`). | B2 (fewer link sites) | 146 pages. Every old URL returns 308 to its canonical. `route-inventory-canary.test.ts` and `route-access-matrix.test.ts` updated. |
| **B4** | Other unreachable components: host (`HostHeader`, `HostListingFilters`, `HostListingForm`, `HostThreadGroups`/`HostThreadList`, `WeatherWidget`, `fixtures.ts`, orphan `HostMoreMenu.module.css`); seeker (`PrimaryActionCard`, `QuickStats`, `ResumePanel`, `SeekerDirectory`, `SeekerHero`, `NotificationPrefsForm`, `TravelPanel.tsx`, `travel.ts`); `onboarding/OnboardingWalkthrough` (+CSS, `tourSteps.ts`); `discovery/DiscoveryFeed.tsx`; `global/ThemeSwitcher`; `listing/fixtures.ts`; `navigation/BottomNav.module.css`; 9 unused barrels (`components/index.ts`, `services/index.ts`, …); `packages/ui/src/FoundingCountdown.tsx` (0 importers); `packages/db/src/queries/emailContext.ts`. | Delete in batches of ≤ 10 files. **Keep** (referenced dynamically or by guardrails): `lib/devBench/clerkServerShim.ts` (webpack alias), `lib/photoBucketCredits.ts` (seeder target), `components/dev/surfaces.ts` and `discovery/data.ts` (read by `check-dev-bench.mjs`), `components/founding/FoundingCountdown.tsx` (allow-listed in `check-founding-host-claims.mjs:77`), `__type-tests__/`. | — | Per batch: typecheck, guardrails, tests and build pass. Tests that read source paths are updated (`role-chrome.test.ts:111-125`, `seeker-chrome.test.ts:96`, `host-workspace-comms.test.ts:689,886,979`). AGENTS.md §8.5 is updated when `FoundingCountdown` (ui) goes. |
| **B5** | **CSS repetition.** The top repeated blocks: focus ring (82 files / 159 rules), reduced-motion `transition:none` (71/77), `flex column gap-8` (45/49), `gap-12` (36/40), chip-row wrap (32/36), list reset (26/31), section-title stack (25/26), **`.srOnly` re-implemented ≈25–28 times** ✔ with no global utility. There are **two competing focus treatments** (`--ui-focus-ring` in 82 files vs `outline: 2px solid var(--color-cta)` in 26). | Add `styles/utilities.css` (`.sr-only`, `stack-{4,8,12,16}`, `cluster-8`, `reset-list`, type-role classes). Pick one focus treatment (founder or design call). Migrate in batches by route group. | Design decision on focus | Redundant rule instances < 1,500 (from 2,964). 0 local `.srOnly`. One focus treatment. G50/G51 baselines unchanged or tighter. 380/1024 px renders unchanged. |
| **B6** | **Byte-identical or near-identical files.** 6 host `page.module.css`, the host/seeker `layout.module.css` pair, `not-selected`/`withdrawn`, 3 `status.module.css` (identical apart from comments), 3 identical `loading.tsx` (`host/{applicants,messages,listings}/[id]`), 14 near-identical `error.tsx` (0.86–0.91 similar; only 4 use `StatusCard`), `HousingFormDrawer`/`MealsFormDrawer.module.css` (0.93 similar, 14 KB each). | One `status.module.css`, one `RouteErrorBoundary` (wrapping `StatusCard`), one `DetailLoading`, and a shared `BenefitFormDrawer.module.css` (keeps the HOUSING/MEALS triad, styling only). | B5 utilities | 0 exact-duplicate groups in `inventory.json`. Every `error.tsx` is ≤ 15 lines. |
| **B7** | **Parallel dialog systems.** `Modal` (2 users) vs `PopupShell` (17) vs 11 hand-rolled `role="dialog"`. | Decide the canonical dialog (`PopupShell` has the adoption and the founder's reference set: `ui-ideas-2/README.md`, "Popup shell owner"). Promote it to `packages/ui`, and migrate `Modal` users and hand-rolled dialogs one at a time, keeping focus-trap and escape behaviour tested. | Founder/design | 1 dialog primitive. A11y tests (focus trap, `aria-modal`, Escape) pass for each migrated dialog. |
| **B8** | **Design-system bypass.** 323 raw `<button>`. `.btn*/.chip*/.badge*/.card*` are re-styled locally (`.card*` has 178 selectors across 37 files). About 30 `ui-*` primitives are unadopted. | Add `Button` `variant="link"`/`"unstyled"`, then a **ratchet guardrail** on raw `<button className>` (baseline 323, may only tighten). Adopt `ui-field`/`ui-input`/`ui-stat` in forms and KPI strips. | B5 | The guardrail is in `pnpm guardrails`. The count is non-increasing. |
| **B9** | **Phantom dependencies.** `packages/ui` imports `react`/`react-dom` (8 files) with no `peerDependencies`. `server-only` is imported by 29 web + 47 db files and declared nowhere (it works via Next's alias). `playwright` is used by 18 e2e specs but declared only at the root. **No unused runtime dependency was confirmed.** `@modelcontextprotocol/sdk` (peer of `mcp-handler`), `import-in-the-middle`/`require-in-the-middle` (Sentry/OTel externals) and `sharp` (dynamic import) are all needed. | Declare the peers and devDependencies. Add `knip` with an ignore list for the Sentry/OTel and MCP peers. | — | `knip` reports 0 unused and 0 unlisted in CI. |
| **B10** | 35 non-dev files import `lib/devBench` for fixture fallbacks, so fixture code ships in production bundles (gated at runtime, not a security issue). | Move the fallback behind a server-only module boundary, or `process.env.NODE_ENV` dead-code elimination. | B4 | Production client bundles contain no `DISCOVERY_FIXTURES` (checked with a grep of `.next/static`). |

### 3.3 Dependency map for the whole plan

```
A1 ✔ ─┬─> A2 (Spark stages 2→6, founder-gated) ─> A4, A8, A9
      ├─> A3 (env manifest, G57) ───────────────> A4, A8
      ├─> A5, A6, A11, A12 (independent, small)
      ├─> A7 (self-host font)
      └─> B1 ✔ ─> B2 ─> B3
                  └──> B4 ─> B10
                  B5 ─> B6, B8      B7 (design decision)      B9 (independent)
```

**Suggested order for the next five PRs:**
1. A5 + A6 (tiny security hygiene)
2. B2 (−104 KB of dead demo code)
3. A3 (env manifest)
4. A7 (offline-safe build)
5. B3 (alias routes)

None touches schema, auth flow, RLS, payments or deploy configuration.

