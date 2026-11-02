# Cleanup Manifest

Every proposed deletion is classified as **Safe** (done in this PR), **Conditional** (needs a founder or owner decision first) or **Preserve**. Sizes come from [`inventory.json`](./inventory.json). · **Date:** 2026-11-02

## 1. Safe: applied on branch `claude/serene-franklin-kni5s1`

| ID | Change | Files | Saving | Evidence | Risk / reversal |
|---|---|---|---|---|---|
| **S1** | Removed `docs/design/reference/ui-ideas/`. Folded its README's unique guidance into `ui-ideas-2/README.md`. | 21 PNG + 1 README | **56.98 MB** of working tree | All 21 PNGs `cmp`-identical to `ui-ideas-2/` (also SHA-256 and git blob SHA). `grep -r "ui-ideas"` over apps, packages, tools, `.claude`, `.github` and docs finds only the two READMEs. ui-ideas-2's README already described itself as "the original popup/card references plus" the community pack. | None functional. Reverse with `git checkout 732f300 -- docs/design/reference/ui-ideas`. History is unchanged. |
| **S2** | `.gitignore`: design-source formats (`psd`, `sketch`, `fig`, `ai`, `xd`, `afdesign`, `heic`), video, archives, *new* rasters under `docs/**`, Playwright blob reports, Lighthouse output, editor cruft. | 1 | prevention | Ignore rules never untrack committed files. `git check-ignore` confirms `apps/web/public/**` and all `.env.example` files are **not** ignored. | A legitimate new doc image needs `git add -f`, which is documented in the file. |
| **S3** | Guardrail **G55** `tools/scripts/check-binary-budget.mjs` plus baseline, added to `pnpm guardrails`. Hard cap: no file over 5 MiB. Ratchet: no file over 1 MiB unless grandfathered, and grandfathered files may only shrink. | 2 new + `package.json` | prevention | Baseline is exactly the 29 ui-ideas-2 PNGs. Rules were exercised: a new 2 MiB file fails, a new 6 MiB file fails, a grandfathered file that grows fails, and the clean tree passes. | Remove the one `&& node …` clause to disable. Must be confirmed in this PR's CI log (the reusable workflow lives in `AutomatedEmpires/.github`, which was out of scope to read). |
| **S4** | Fixed the date-dependent `founding-host-program.test.ts` by pinning `Date` to the fixture `NOW`. | 1 test | — | §5 of REPOSITORY_AUDIT. Product code unchanged. | Test-only. |
| **S5** | Added Spark/production isolation rules, tests and CLI. Not wired. | 3 new | — | SPARK_PRODUCTION_ISOLATION.md | Additive, with no runtime import. |
| **S6** | Untracked 8 build artifacts committed inside package `src/`: `mailer`, `stripe-seed` and `test-utils` `index.{js,d.ts}`, plus `db/src/types.gen.{js,d.ts}`. Set `outDir: ./dist` (gitignored) so `tsc -b` stops emitting beside source. The mailer test now imports `../index`, not `../index.js`. | 8 removed, 4 edited | 0.29 MB | **Correctness, not size.** vitest was running the emitted `index.js`, not `index.ts`: appending a `throw` to `index.js` broke the suite. `types.gen.d.ts` (139 KB, 2026-06-06) had drifted from `types.gen.ts` (104 KB), and TS never resolved it. Every `exports` map points at `src/*.ts`. | Low. Typecheck, all suites and `pnpm build` pass. Revert the commit to undo. |

**Net result:** tracked tree goes from **159.25 MB to ~102.0 MB** before the new reports (about 60 KB of Markdown, JSON and TSV are added). No production file was modified.

## 2. Conditional: needs a decision; not applied

| ID | Proposal | Saving | Evidence | Risk | Decision needed from |
|---|---|---|---|---|---|
| **C1** | **Externalize `ui-ideas-2/` comps.** Options, in order of preference:<br>**(a)** Move the PNG originals to the founder's design archive (Google Drive / Figma / a private Supabase `design-reference` bucket). Commit WebP q90 previews with a `SOURCES.md` listing each original's SHA-256 and location.<br>**(b)** Keep them in git, but exclude them from everyday clones via sparse checkout (LOCAL_DEVELOPMENT_READINESS §1). Zero risk, and it already works.<br>**(c)** Git LFS. **Not recommended**: it adds a paid-bandwidth dependency and a client install, and Vercel and every agent sandbox must support it. | (a) 79.6 → **12.0 MB** measured (WebP q90 via sharp; lossless WebP only reaches 59.2 MB)<br>(b) 0 in the tree, 80 MB per lean clone | No code reference. They are founder design intent, and the comps are AI-generated (`ChatGPT Image …`). | (a) loses pixel-exact originals from git, so the external location must be confirmed **before** removal, or the result is a broken link. | **Founder** (owns the assets) |
| **C2** | Delete 11 remote branches proven merged or empty (content verdict, not ancestry). | clone noise | `branches.tsv` rows `content-in-main` (7) and `empty` (4, excluding this branch). Verdict: main's copy of every file the branch touched is byte-identical. | Low. Branches are recoverable from any clone's reflog only for a short while, so archive with `git tag archive/<name> <sha>` first if wanted. | Founder (AGENTS.md: no destructive ops without approval) |
| **C3** | Triage the other 48 branches that differ from main: 18 `codex/*`, 11 `preserve/*`, 7 `claude/*`, 6 `dependabot/*` (open PRs, keep), 3 `agent/*`, 2 `design/*`, 1 `wip/*`. | — | "Diverges" includes "main has moved on since". Needs `ae verify explore-and-earn <branch>` per branch. | Deleting a branch with unmerged work loses it. | Founder + `ae verify` |
| **C4** | Close one of the duplicate MCP SDK Dependabot PRs (#346 root, #347 apps/web), then rebase the remaining Dependabot PRs after this merges. | — | Both bump `@modelcontextprotocol/sdk` 1.26 → 1.32. All 6 have been red since 2026-09-13 only because of the S4 test. | Low | Engineering |
| **C5** | Consolidate byte-identical CSS modules: 6 host `page.module.css`, the host/seeker `layout.module.css` pair, `not-selected`/`withdrawn`, `messages/[id]`/`profile/edit`. | 1.2 KB | `inventory.json` → `after.duplicateGroups`. | Low, but it touches 12 route files. Needs a 380 px + 1024 px render check per CLAUDE.md. | Engineering (separate PR) |
| **C6** | Retire or populate `.agents/*.md` (6 empty stubs). | 0 B | Open question `Q-AGENTS-DIR` (`docs/source-of-truth/open-questions.md:10`). `claude-code.yml:83` tells agents to "Follow … .agents role files". | If retired, edit the `claude-code.yml` prompt in the same PR. | Architect |
| **C7** | Remove `.env.example` entries with no reader (`ANTHROPIC_API_KEY`, `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_API_KEY`, `SUPABASE_PROJECT_REF_PROD`, `MAPBOX_ACCESS_TOKEN`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`). Add the 16+ undocumented ones. | — | ARCHITECTURE_RECOVERY_PLAN A3. | Some may be read by Doppler, Vercel or external tooling. Confirm in Doppler before removing. | Engineering + founder (Doppler) |
| **C8** | Dead code: **75 files / ~280 KB** unreachable from production entry points. 19 files / ~104 KB of them are the superseded legacy demo (`components/demo/Demo*`, `ProductTour`, `tourStops`). Also 9 alias demo routes. Plan items B2–B4. | ~0.28 MB | Symbol-aware import reachability. `DemoSession` re-verified: imported only by other dead legacy files and a barrel whose single consumer takes `DemoJobCard`. | Source-reading tests and guardrails reference some files by path, and the keep-list is in plan B4. Batches of ≤ 10 with a full build. | Engineering |

## 3. Preserve: explicitly kept

| What | Why |
|---|---|
| `supabase/migrations/` (92 files, 1.3 MB) | Schema history. Migrations 058–065 have not yet been applied (founder pipeline). A count of migrations is not a defect. |
| `apps/web/public/photos/` (60 WebP, 9 MB) | Licensed production photography served by the catalog. The 6 catalog-only slugs (about 1.4 MB) are data, not dead files. |
| `docs/design/reference/_benchmarks/` (0.4 MB) | Benchmarks cited by audit JSONs. |
| `docs/**/*.md` (139 files, 1.3 MB) | Product and decision memory. AGENTS.md: "if it is not written … it did not happen." Cheap to keep. |
| `docs/archive/` | Archived on purpose, and small. |
| `tools/github-notion-sync`, `tools/notion-github-issue-dispatcher` | Deployed Notion workers, part of the control plane. |
| `apps/jobs` (placeholder) | Workspace slot for planned background jobs, and tiny. |
| Demo routes `/for-hosts/demo`, `/for-seekers/demo` and `components/demo/full-fidelity/` | **Public marketing surfaces**, not prototypes: noindex, static fixtures, no DB writes, no analytics. (The *legacy* `components/demo/Demo*` files are dead; see C8.) |
| Dev bench (`lib/devBench`, `/dev`) | Local-only and guarded (G: `check-dev-bench.mjs`). |
| `.agents/`, `venture.yaml` | 0 bytes, pending C6 and founder confirmation. |

## 4. History-rewrite proposal (NOT executed; needs explicit authorization)

**Goal:** shrink every full clone from about 97 MB of history to about 20 MB.

**What it would remove:**
- the 29 `docs/design/reference/**/*.png` blobs (75.4 MiB compressed, unique);
- the historical `apps/web/playwright-report/`.

### Prerequisites
- C1 must be decided first. Rewriting removes the originals from git entirely, so they must already be stored elsewhere and verified.
- Announce a freeze. No open PRs should be mid-review.

### Procedure (for whoever is authorized)

```bash
git clone --mirror https://github.com/AutomatedEmpires/explore-and-earn.git ee-mirror.git
```

```bash
cd ee-mirror.git && git filter-repo --invert-paths --path-glob 'docs/design/reference/*.png' --path apps/web/playwright-report/
```

```bash
git push --force --mirror origin
```

### Consequences

| Area | Impact |
|---|---|
| **Every commit SHA changes** from the first commit that touched those paths (2026-06-09, `8947cd0`) onward. That is effectively all of `main`'s recent history. | Commit links in Notion, PR descriptions, handoff docs (e.g. "fixed at `5152733`"), `AGENTS.md` and runbooks stop resolving. |
| **Branches** | 52 of 61 remote branches contain the folder and would be rewritten. Any branch *not* rewritten in the same mirror push reintroduces the blobs when merged. |
| **Open PRs** | The 6 Dependabot PRs would need recreating, which Dependabot does automatically. Human PRs must be rebased by hand. |
| **Tags / releases** | 0 tags today, so nothing is affected. |
| **Forks and clones** | Every existing clone, including the canonical WSL clone and every agent worktree, must be re-cloned. A `git pull` on old history merges the blobs back. GitHub keeps old objects reachable via cached PR refs until GitHub Support runs a GC. |
| **Vercel** | Deployments build from the new SHAs. Existing deployment records still point at old SHAs, so rollback-by-commit to a pre-rewrite build breaks; promote an existing deployment instead. |
| **Branch protection / rulesets** | Force-push to `main` must be temporarily allowed, then re-locked. |
| **Signed or attributed commits** | Signatures on rewritten commits are lost. |
| **CI history** | Run history stays, but links to old SHAs show "commit not found". |
| **Collaborators and agents** | Every agent (Codex, Copilot, Claude, Notion) must be told. The `ae` control plane's recorded SHAs become invalid. |

**Recommendation:** **do not rewrite now.** The blobless + sparse clone already gives a 42 MB local checkout with zero destructive action. Revisit the rewrite only if a full mirror clone becomes a measured problem, for example for CI cache or for a new collaborator who needs full history.
