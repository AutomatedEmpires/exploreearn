# Local Development Readiness (Cursor, WSL2 Ubuntu 24.04, ARM64)

**Verdict:** **ready to clone**, with three conditions:
1. Use the lean clone command below.
2. Give WSL at least 10 GB of memory before running `pnpm build`.
3. Run local dev against fixtures, not the production database (§5).

**Date:** 2026-11-02. Every measurement below was taken in a clean 4-core, 15 GB x86_64 Linux container on Node 24.16.0. ARM64 behaviour should match, but it was not tested; see §7.

---

## 1. Clone: what it costs

| Method | `.git` | Working tree | Total |
|---|---|---|---|
| `git clone` (all branches, as a default clone does) | ~97 MB | 158 MB | ~255 MB |
| `git clone --single-branch --branch main` | 92 MB | 158 MB | 250 MB |
| `--filter=blob:none` (blobless) on `main` today | 90 MB | 158 MB | 248 MB (**no saving**: the PNGs are at the tip) |
| **Blobless + sparse, excluding `docs/design/reference/`** (`main` today) | **15 MB** | **27 MB** | **42 MB** |
| After this PR merges, plain clone | ~97 MB | ~102 MB | ~199 MB |
| After this PR merges, blobless + sparse | ~15 MB | ~27 MB | ~42 MB |

**The lean clone works today, needs no history rewrite and no waiting on this PR, and is 83% smaller.** Run it from inside WSL, in your home directory (never under `/mnt/c`, where I/O is roughly 10x slower):

```bash
git clone --filter=blob:none --no-checkout https://github.com/AutomatedEmpires/explore-and-earn.git
```

```bash
cd explore-and-earn && git sparse-checkout set --no-cone '/*' '!/docs/design/reference/' && git checkout main
```

- To pull the design reference comps later, run `git sparse-checkout disable`. Git fetches those blobs on demand.
- Blobless clones fetch missing objects lazily, so `git log -p` or `git blame` on old files needs network access.

> AGENTS.md says the WSL canonical clone is the **only** writable copy and that parallel work uses `ae start … --worktree`. This guide does not change that. It describes how to make that one clone lean.

## 2. Toolchain

| Need | Value | Notes |
|---|---|---|
| Node | **24.16.0** exactly (`.nvmrc`, `engines`) | Node 22 installs and mostly works, but it is not the baseline. The isolation CLI needs Node 22.18 or later for built-in type stripping. |
| pnpm | 10.12.4, via `corepack enable` | `pnpm install --frozen-lockfile` took 14 s with a warm store. pnpm skipped the build scripts of `@parcel/watcher`, `@sentry/cli`, `@swc/core` and `core-js` (not approved via `pnpm approve-builds`). Nothing failed because of it. |
| `node_modules` | **1.2 GB** | Keep it on the Linux filesystem. |
| Playwright | `playwright@1.61.1` | Run `pnpm exec playwright install chromium` once before `pnpm test:e2e`. |
| Doppler CLI | for real secrets | `.env.example` lists names only. Values come from Doppler (§5). |

## 3. Validation baseline (measured on this branch)

| Command | Result | Time |
|---|---|---|
| `pnpm typecheck` | ✅ pass | 52 s |
| `pnpm lint` | ✅ 0 errors · 2,227 warnings (all `no-untranslated-jsx-text`, i18n backlog) | 20 s |
| `pnpm guardrails` | ✅ pass (now includes G55 binary budget) | 6 s |
| `pnpm test` | ✅ web: 151 files / **2,764 tests**; db: 85 files / 1,131 passed + 23 skipped; mailer: 18; stripe-seed: 29 | 35 s (web) |
| `pnpm build` (apps/web) | ✅ compiled every route in 3.0–3.1 min. See §4 for the one flaky failure. | 4.5 min wall |
| `pnpm test:e2e` | ⚠️ not run here: needs Playwright browsers plus a running app with test credentials | — |

On `main` *before* this PR, `pnpm test` **fails** (1 test, `founding-host-program.test.ts`). The cause was a date-dependent test, fixed in this PR; see REPOSITORY_AUDIT §5.

## 4. Memory: why the production build crashed before

**Resource exhaustion, not a compilation defect.** The evidence:

- **Peak memory** of a clean `pnpm build` was **5.65 GB above idle**, sampled every second with whole-system `free -m` (p95 5.28 GB, 272 samples). The build wrapper caps the main Next process at a 4 GB heap (`tools/scripts/run-web-next-build.mjs`), and the `webpackBuildWorker` child plus SWC add the rest.
- **WSL2 defaults to 50% of host RAM**, which is **8 GB on a 16 GB laptop**. That 8 GB is shared with VS Code/Cursor, the TypeScript server and ESLint. 5.6 GB for the build plus 2–3 GB for the editor exceeds it, so the kernel OOM-kills the build. The earlier handoff notes match this: "`origin/main` OOMs identically" (`docs/handoff/2026-07-27-fable-production-handoff.md:368`), and `next dev` crashes on an "~8 GB" box (`docs/audit/PRODUCTION_READY_FINAL_REPORT.md:106`).
- **It compiles.** 2 of 3 builds here succeeded and compiled every route. CI's Build step succeeds on GitHub's 16 GB runners (for example, run 34775354504 built in 3 minutes; only its Test step failed).
- **The third build here did fail, for a different and real reason.** `next/font/google` fetches Manrope from Google Fonts *at build time*, and one fetch returned CSS that Next's loader could not parse (`TypeError: Cannot read properties of null (reading '1')` at `@next/font/dist/google/loader.js:122`). The same fetch succeeded three times in isolation, and the next build passed. Treat it as a **network-dependent, non-deterministic build step**. It also means **offline builds cannot succeed**. Fixing it means self-hosting the font with `next/font/local`; see ARCHITECTURE_RECOVERY_PLAN item A7.

**Fix for the laptop.** Create or edit `%UserProfile%\.wslconfig` on Windows, then run `wsl --shutdown`:

```ini
[wsl2]
memory=10GB
swap=8GB
```

Close the Cursor window while running `pnpm build` if you stay at 8 GB. **Day-to-day work does not need `pnpm build`.** `pnpm typecheck && pnpm lint && pnpm guardrails && pnpm test` takes about 2 minutes and uses well under 4 GB. Leave the full build to CI unless you are touching route exports or `next.config.ts`.

## 5. Running locally without touching production

- **Default to fixtures.** `next dev` with `NEXT_PUBLIC_SUPABASE_URL` unset serves discovery from fixtures (`components/discovery/data.ts:35`, `allowFixtureFallback = NODE_ENV !== "production"`).
- **Dev bench.** `NEXT_PUBLIC_DEV_BENCH=1` gives role impersonation over fixtures. Its privileged mode also requires a *local* Supabase URL (`lib/devBench/index.ts:51-95`).
- **Do not run `doppler run -- pnpm dev` with the production config.** There is currently no non-production Supabase project. Production is the only hosted project, so Doppler-injected values point a dev server at production data.
- **Check before you run:**

  ```bash
  doppler run -- node tools/scripts/check-environment-isolation.mjs
  ```

  With `NODE_ENV` unset it evaluates as `development`, and it refuses a production service-role key, a production database URL, or live Stripe and Clerk keys.
- **Local Supabase.** `supabase start` (Docker) gives a disposable database with all 92 migrations. Use `supabase db reset` to re-seed.

## 6. Remaining blockers before local cloning

| # | Blocker | Severity | Owner | Resolution |
|---|---|---|---|---|
| 1 | Merge this PR, which turns `main`'s test suite green again (it has been red since 2026-09-01). | **High**: every Dependabot PR is red until then | Founder review | Review and squash-merge. |
| 2 | WSL memory at 8 GB default. | **High** for `pnpm build` only | Founder (laptop) | `.wslconfig` `memory=10GB` (§4). |
| 3 | No non-production Supabase project, so there is no safe shared dev database. | Med | Founder (approval gate: schema/migrations) | Spark stage 3 (SPARK_PRODUCTION_ISOLATION.md §4). Until then, use fixtures or local Supabase. |
| 4 | Build depends on Google Fonts over the network. | Low–Med | Engineering | ARCHITECTURE_RECOVERY_PLAN A7. |
| 5 | 6 Dependabot PRs open and red (Next 15.5.24, Sentry 10.75.2, MCP SDK 1.32 ×2, sharp, vitest). | Low | Engineering | After merge, rebase each and let CI rerun. `@modelcontextprotocol/sdk` is bumped twice (root and apps/web), so close one. |
| 6 | 61 remote branches, of which 11 are provably merged or empty (`branches.tsv`). | Low (clone noise only) | Founder | Delete the 11 after review. Use `--single-branch` to avoid fetching the rest. |

## 7. What was not verified

- ARM64 specifically. Native modules (`sharp`, `@swc/core`, `@parcel/watcher`) ship `linux-arm64` prebuilds, but this was not run on ARM.
- `pnpm test:e2e`, the `db-assert` SQL assertions against a live database, and Stripe/Clerk webhooks end to end.
- Runtime behaviour against real services. Unit tests and a green build do **not** make the app production-ready (REPOSITORY_AUDIT §6).
