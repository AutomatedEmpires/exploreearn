# UI Ideas 2 Reference Set

Source folder on machine:
- `/mnt/c/Users/autom/projects/automated_empires/explore&earn/ui ideas 2`

Preserved in repo:
- `docs/design/reference/ui-ideas-2/`

> **Consolidated 2026-11-02.** This folder is now the single home for the UI
> reference comps. The former `docs/design/reference/ui-ideas/` folder held 21
> PNGs that were byte-for-byte identical (SHA-256) to files here, so it was
> removed to save ~57 MB from every checkout. Its unique guidance (the
> visual-system summary, implementation owners, intended mapping and build
> discipline) is preserved verbatim below under
> "Popup & card references (originally `ui-ideas/`)". The original folder is
> recoverable from history: `git show 732f300:docs/design/reference/ui-ideas/README.md`.

## What Changed Versus The First UI Ideas Set

This folder contains the original popup/card references plus a new community-dashboard reference pack.

## New Community Dashboard References

### Feed
- `community dashboard feed (pc_.png`
- `community dashboard feed mobile.png`

### Photos
- `community dashboard photos (pc).png`
- `community dashboard photos mobile.png`

### Announcements
- `community dashboard announcements (pc).png`
- `community dashboard announcements (mobile.png`

### Additional concept comps
- `ChatGPT Image Jun 8, 2026, 04_32_47 PM.png`
- `ChatGPT Image Jun 8, 2026, 04_36_12 PM.png`

## New Design Language Confirmed By This Set

1. Community is a full three-tab product surface, not a single feed block.
2. Tabs are explicitly `Feed`, `Photos`, and `Announcements` with the same parchment shell as the rest of the product.
3. The top bar uses search, notification, and avatar actions inside the same illustrated shell.
4. Every community card uses the same paper-card framing with heavy ink outline and soft grain texture.
5. Reactions are standardized across card types: smile, heart, 100, raised hands, sparkle.
6. Seeker, host, and blog posts all belong in the same feed system, with different card variants.
7. Host announcement cards use pinned/taped scrapbook treatment plus `View host profile` CTA.
8. Photo posts use large scenic media with inline tags and a lighter body copy block.
9. Blog/editorial cards can expand into a dedicated article reading surface.
10. Mobile is not a scaled-down desktop canvas; the layout stacks and simplifies intentionally.
11. The community page includes supportive side or footer modules such as welcome/xp, popular tags, help, and upcoming listings.

## High-Value UI Patterns In The New References

### Community shell
- Brand mark at left
- Three tab nav centered
- Search, notification, avatar controls at right
- Welcome / level progress strip below nav

### Feed cards
- Mixed card types in one feed: seeker post, host post, blog post
- Author lane badge (`SEEKER`, `HOST`, `BLOG`)
- Scenic media at right or full-width depending on card type
- Reactions in a consistent footer rail

### Photos tab
- Image-dominant cards
- Tag chips overlaid on media
- Short caption + lightweight action button
- Same reaction bar as feed

### Announcements tab
- Host-first posting format
- Pinned note / scrapbook composition
- Three-image gallery pattern
- Strong `View host profile` CTA

### Secondary support modules
- Welcome / XP card
- Popular tags card
- Help card
- Upcoming listings card

## Suggested Implementation Owners

### Community page shell and tabs
- likely new seeker-scope route/page for community
- same visual token family as the popup/card system

### Community card primitives
- new shared community card family:
  - seeker post card
  - host announcement card
  - blog/editorial card
  - photo post card

### Article detail surface
- dedicated blog/article reading view matching `ChatGPT Image Jun 8, 2026, 04_36_12 PM.png`

## Implementation Implication

The new references broaden the vision beyond popups. They define a community dashboard system with:
- page-level shell
- feed variants
- editorial/article detail
- support modules
- responsive mobile patterns

This should be treated as its own surface pack, parallel to the popup/card work, not as a one-off page mock.

## Popup & card references (originally `ui-ideas/`)

### Shared Visual System Present In The References

1. Warm parchment panel background with visible paper grain.
2. Dark hand-ink border treatment with double-outline feel.
3. Scenic illustrated hero art used inside both cards and popups.
4. Crest / medallion identity treatment rather than flat avatar chips.
5. Bold all-caps display titles for shell headers and card labels.
6. Inset framed sub-panels for facts, stats, reasons, and form groups.
7. Blue primary CTA, neutral secondary CTA, and semantically colored outline accents.
8. Repeated icon + label pattern across cards, popups, and rails.
9. Consistent close / report affordances in popup top-right actions.
10. A single family resemblance between host, seeker, and admin surfaces.

### Current Implementation Surfaces To Align

#### Popup shell owner
- `apps/web/components/overlay/PopupShell.tsx`
- `apps/web/components/overlay/PopupShell.module.css`

#### Canonical marketplace card owner
- `packages/ui/src/DiscoveryCard.tsx`

#### Host applicant wrapper and action row
- `apps/web/components/host/HostApplicantCard.tsx`
- `apps/web/components/host/HostApplicantCardActions.tsx`

### Intended Mapping

#### Discovery card family
- `seeker discovery card saved.png`: canonical seeker card baseline.
- `seeker discovery card applied.png`: applied-state CTA/state treatment.
- `seeker discovery card offered.png`: offer-state CTA/state treatment.
- `seeker discovery card schedule.png`: upcoming/scheduled CTA state.
- `seeker applicant card.png`: host-side applicant review card layout.
- `featured seeker applicant card.png`: promoted/high-match applicant variant.
- `seeker photo card.png`: image-heavy variant for profile/photo contexts.

#### Popup family
- `quick peek popup card.png`: listing analytics / quick-peek shell.
- `host profile popup.png`: host identity modal shell.
- `seeker profile popup.png`: seeker identity modal shell.
- `message host popup.png`: locked/permission-aware message shell.
- `message seeker popup.png`: inverse message shell for host lane.
- `housing popup.png`: media grid + structured form shell.
- `meals popup.png`: same shell family as housing, meals-specific content.
- `pay popup.png`: benchmark / meter modal pattern.
- `report listing popup.png`: report flow shell with reason-grid layout.
- `report host popup.png`: host reporting variant.
- `report seeker popup.png`: seeker reporting variant.
- `admin profile popup.png`: admin moderation/profile inspection variant.
- `explore&earn profile popup.png`: brand/profile overview variant.

#### Rail / carousel family
- `featured employers reel.png`: homepage rail / editorial featured-employer module.

### Build Discipline To Match The Vision

1. Do not fork card anatomy per page. Extend `DiscoveryCard` by surface/slot only.
2. Do not fork modal chrome per feature. Extend `PopupShell` by props/slots only.
3. Treat the parchment texture, border, corner radius, close button, and CTA language as shared tokens.
4. Move every popup into the same header/body/footer anatomy before tuning content details.
5. Use one variant matrix for states: seeker, host, applicant, saved, applied, offered, scheduled, featured.
6. Validate each implementation against its matching PNG before moving to the next surface.
