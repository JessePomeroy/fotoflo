# AGENTS.md — fotoflo

Personal film photography workflow management app for Jesse Pomeroy.
PWA — installable on macOS/Windows/Linux. Works offline.

---

## Stack

- **Framework:** SvelteKit (Svelte 5, runes mode)
- **UI:** `@dvcol/neo-svelte` (NeoDialog for modals with blur effects)
- **PWA:** `vite-plugin-pwa` (service worker, offline support)
- **EXIF:** `exifreader`, `piexifjs`
- **Testing:** `vitest`
- **Styling:** Custom CSS with glassmorphism theme

---

## Critical Rules

### Svelte 5 runes — always
- Use `$state`, `$derived`, `$effect`, `$props` — not legacy Options API
- Use `$app/state` for page store — NOT `$app/stores`
- No `export let` for props — use `let { prop } = $props()`

### UI/Design conventions
- **All text lowercase** — no title case, no caps
- **No emojis** in UI
- **Glassmorphism theme** with greyish-blue (`#5D7B8C`) accents
- NeoDialog for all modals (blur effect)
- Firefox preferred for dev (Chrome has caching issues with PWA)

### File naming convention
`{film-stock}-{camera}-{subject}-{frameNumber}` — no folders, flat structure

### PWA
- Service worker caches assets for offline use
- Test PWA install via browser install prompt (not dev tools)
- Don't break service worker registration — check `vite-plugin-pwa` config before modifying vite.config

### Git
- Remote: `https://github.com/JessePomeroy/fotoflo.git`
- Branch: `main`
- Do NOT push to `main` without explicit instruction from Jesse

---

## Features

- Import photos from external hard drive
- Grid + thumbnail views
- Ratings, tags, collections
- Bulk metadata editing
- File renaming (per naming convention)
- Rating filters
- Duplicate detection
- Search + sort
- Prev/next navigation in viewer

---

## Commands

```bash
pnpm dev          # Dev server
pnpm build        # Production build
pnpm svelte-check # Type-check Svelte files
pnpm test         # Run vitest
```
