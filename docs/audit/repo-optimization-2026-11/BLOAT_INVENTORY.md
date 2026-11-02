# Bloat Inventory

**Machine-readable source:** [`inventory.json`](./inventory.json), generated from `git ls-tree -r -l` over the committed trees `origin/main` (`732f300`) and this branch. Anyone can re-run it and get the same result. Branch topology is in [`branches.tsv`](./branches.tsv). · **Date:** 2026-11-02

## 1. Headline

| Metric | Before (`main`) | After (this branch) | Δ |
|---|---|---|---|
| Tracked files | 1,973 | 1,956 | −17 (−30 removed, +13 added: reports, guardrail, isolation module) |
| **Tracked working-tree size** | **159.25 MB** | **102.26 MB** (including all new reports) | **−56.99 MB (−35.8%)** |
| Tracked binary size (images, fonts, archives) | 145.59 MB (115 files) | 88.62 MB (94 files) | −56.97 MB |
| Exact-duplicate groups (content hash) | 30 groups, 56.98 MB redundant | 8 groups, 2.2 KB redundant (tiny CSS modules, per-package tsconfigs, empty stubs) | −56.98 MB |
| Git history (pack, all 61 remote branches) | 94.4 MiB | 94.4 MiB + a few KB | **unchanged**: no rewrite (see CLEANUP_MANIFEST §4) |
| `main` only, single-branch clone | 92 MB `.git` + 158 MB tree | ~92 MB `.git` + ~102 MB tree | −56 MB per checkout |
| Blobless + sparse clone | — | 15 MB `.git` + 27 MB tree | works on today's `main` already |

Two mechanisms produce these numbers:
- **The working tree shrank by a third.**
- **Full-clone history did not shrink, and cannot without a rewrite.** Git already stored each duplicated PNG once. Only 3.3 MiB of the 94 MiB pack is history-only (blobs no longer at the tip). The other ~87 MiB is blobs still present at the tip, and 75.4 MiB of that is the 29 remaining design-reference PNGs, which don't compress.

## 2. Where the bytes are

| Path | Before | After | What it is |
|---|---|---|---|
| `docs/` | 137.93 MB | 80.95 MB | 174 files. 139 are Markdown (1.29 MB total); the rest is reference images. |
| ├ `docs/design/reference/ui-ideas-2/` | 79.61 MB | 79.61 MB | 29 PNG comps (2.0–3.6 MB each) plus README. |
| ├ `docs/design/reference/ui-ideas/` | 56.98 MB | **removed** | 21 PNGs, byte-identical to ui-ideas-2, plus README (merged). |
| └ `docs/design/reference/_benchmarks/` | 0.40 MB | 0.40 MB | 3 benchmark HTML pages plus 3 audit JSONs, cited by audits. |
| `apps/` | 16.47 MB | 16.47 MB | `apps/web` (2.9 MB TSX, 5.2 MB TS incl. tests, 1.6 MB CSS). |
| ├ `apps/web/public/photos/` | 8.96 MB | 8.96 MB | 60 WebP (30 photos × 800/1600 px), licensed catalog via `manifest.json`. |
| └ `apps/web/public/icons/` | 0.06 MB | 0.06 MB | 5 PWA icons. |
| `packages/` | 2.36 MB | 2.36 MB | contracts, db (76 src / 87 tests), mailer, stripe-seed, test-utils, ui. |
| `tools/`, `supabase/`, `ops/`, `scripts/` | 2.00 MB | 2.01 MB | guardrails, Notion workers, 92 migrations, growth CSVs. |
| `pnpm-lock.yaml` | 0.22 MB | 0.22 MB | — |

**Not tracked, and correctly ignored (local disk only):**
- `node_modules` is **1.2 GB**.
- `apps/web/.next` after a build is **2.2 GB**.
- **Committed build output was found and removed (S6).** `tsc -b` emitted into `packages/{mailer,stripe-seed,test-utils}/src/`, and 8 artifacts were tracked there, including a stale 139 KB `db/src/types.gen.d.ts`. The mailer suite was executing the emitted JS. No other build output, coverage, `tsbuildinfo`, logs or `.DS_Store` is tracked. The only historical slip is one `apps/web/playwright-report/index.html` (0.2 MB, history only), and it is already gitignored.

## 3. Largest files (after)

All 29 files over 1 MiB are the `ui-ideas-2` PNGs, and they are now grandfathered by guardrail G55. Top five:

| Bytes | File |
|---|---|
| 3,654,282 | `featured seeker applicant card.png` |
| 3,428,540 | `seeker applicant card.png` |
| 3,348,444 | `seeker discovery card saved.png` |
| 3,253,567 | `seeker discovery card offered.png` |
| 3,248,067 | `seeker discovery card applied.png` |

The largest non-reference file is `apps/web/public/photos/trail-03-1600.webp` at 0.50 MB.

## 4. Exact duplicates

Detection used git blob SHA (a content hash). A working-tree SHA-256 pass independently found the same 30 groups.

| Group | Files | Redundant | Disposition |
|---|---|---|---|
| `ui-ideas/*.png` ≡ `ui-ideas-2/*.png` | 21 pairs | 56,975,833 B | **Removed** (CLEANUP_MANIFEST S1). |
| Host page CSS modules (`analytics`, `help`, `listings/[id]/edit`, `messages`, `profile`, `settings` `page.module.css`) | 6 | 390 B | Conditional C5: consolidate into one shared module. |
| `(host)/layout.module.css` ≡ `(seeker)/layout.module.css` | 2 | 462 B | Conditional C5. |
| `not-selected.module.css` ≡ `withdrawn.module.css` | 2 | 263 B | Conditional C5. |
| `messages/[id]` ≡ `profile/edit` `page.module.css` | 2 | 83 B | Conditional C5. |
| Empty `.agents/*.md` (6) + `venture.yaml` | 7 | 0 B | **Preserve**: open decision `Q-AGENTS-DIR`, referenced by `claude-code.yml`. `venture.yaml` is 0 bytes and unreferenced in-repo, but its name matches the external `ae` control-plane convention (unverified), so it is kept until the founder confirms. |
| Identical `tsconfig.json` / `.gitignore` pairs across tools and packages | 3 pairs | <1 KB | Preserve: per-package config is idiomatic. |

## 5. Design assets: referenced or not

| Asset set | Referenced by | Status |
|---|---|---|
| `ui-ideas-2/*.png` | Its README only. No code, test, guardrail or CI reference. `CLAUDE.md` and the design docs cite design *docs*, not these images. | **Unreferenced by code, but of continuing value as founder design intent.** Conditional C1. |
| `_benchmarks/*.html, *.json` | `AUDIT-three-os-worldclass.json` scopes. 0.4 MB. | Preserve. |
| `_shots/` | Generated by `tools/scripts/shoot*.mjs`. Already gitignored. | n/a |
| `public/photos/*.webp` | `public/photos/manifest.json` catalog, resolved by slug (`components/media/SitePhoto.tsx`). 24 of 30 slugs are used in code. 6 (`cda-lake-02`, `dock-03`, `paddle-03`, 800 and 1600 px each, about 1.4 MB) are catalog-only. | Preserve: licensed catalog, and slugs are data. |
| `public/icons/*.png` | `apps/web/app/manifest.ts:45` (PWA manifest). | Preserve. |

## 6. Dependencies, generated outputs, configuration

- **Dependencies.** See ARCHITECTURE_RECOVERY_PLAN §3 for the per-package unused-dependency audit. Overrides in the root `package.json` (12 security pins) are intentional.
- **pnpm build scripts.** pnpm skipped build scripts for `@parcel/watcher`, `@sentry/cli`, `@swc/core` and `core-js` (they are not approved via `pnpm approve-builds`). Builds and tests pass without them, so nothing needs changing. Note it in case a future tool expects the Sentry CLI binary.
- **Redundant config.**
  - Root `.env.example` and `apps/web/.env.example` disagree. The root file lacks `ADMIN_CLERK_USER_ID`, `AI_GATEWAY_API_KEY`, `ASSISTANT_MODEL` and `NEXT_PUBLIC_DEV_BENCH`.
  - 16+ variables the code reads are undocumented: KV/Upstash ×4, founding prices ×6, invite packs ×3, VAPID public, app version.
  - Some documented variables have no reader: `ANTHROPIC_API_KEY` (code uses `AI_GATEWAY_API_KEY`), `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_API_KEY`, `SUPABASE_PROJECT_REF_PROD`, `MAPBOX_ACCESS_TOKEN`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
  - This is plan item A3. Behaviour isn't affected, so it was not changed here.
- **Large source modules.** A file count on its own is not a defect. But `services/stripe/index.ts` (1,943 lines) and `components/demo/enterpriseDemo.ts` (2,838 lines) are the largest single modules, and they are candidates if they keep growing. They are listed in the plan, not acted on.
