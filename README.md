# Brand — The Science of Permanence

Scroll-driven canvas experience. A 200-frame render sequence is scrubbed against
scroll position, with typographic scenes keyed to frame ranges.

Next.js 14 (App Router) · static export · deployed to GitHub Pages.

## Running locally

```bash
npm install
npm run dev
```

Dev runs with no path prefix. The production build sets `NEXT_PUBLIC_BASE_PATH`
to `/<repo>` because GitHub project pages are served from a subdirectory — see
`app/basePath.js` for why raw `<img>` and `fetch()` URLs need it explicitly.

```bash
NEXT_PUBLIC_BASE_PATH=/brand-chembuild npm run build   # outputs to ./out
```

## Deployment

```bash
npm run deploy
```

Builds the static export and force-pushes `out/` to the `gh-pages` branch,
which GitHub Pages serves directly. Pages source is **Deploy from a branch →
`gh-pages` / root**. The branch is rewritten on each deploy, so it never
accumulates history and `main` stays free of build artifacts.

### Optional: deploy on push instead

`deploy/github-pages-workflow.yml` is a ready-to-use Actions workflow that
builds and publishes on every push to `main`. It isn't enabled, because
pushing a file into `.github/workflows/` requires a token carrying the
`workflow` OAuth scope. To turn it on, add the file through GitHub's web UI
(**Add file → Create new file**, path `.github/workflows/deploy.yml`), paste
its contents, then set Pages source to **GitHub Actions**. Browser commits
aren't subject to that scope restriction.

## The frame sequence

`public/seq/{desktop,mobile}/fNNN.webp` — 200 frames per tier, flat global
numbering, generated from the original 1920×1080 PNG renders.

| Tier | Resolution | Size | Avg/frame |
|------|-----------|------|-----------|
| desktop | 1920×1080 | 31.0 MB | 159 KB |
| mobile | 1100×619 | 12.1 MB | 62 KB |

The originals were 404.7 MB of PNG. Frames are numbered `f000`–`f199` in a
single flat sequence; the per-scene folders and offset mapping they replaced
were the source of an off-by-five frame-count bug.

### Regenerating

The sequence is committed, so this is only needed if the source renders change.
Frame order is: `vision` 1–40, `dna` 1–80, `shield` 41–80, `source` 1–40.

## Loading model

Holding all 200 decoded frames costs roughly 1.7 GB of bitmap memory, which is
what made the original stutter and made mobile browsers discard the tab. Instead:

- Frames decode to `ImageBitmap` and live in an LRU-style window around the
  playhead (120 desktop / 60 mobile); evicted bitmaps are `close()`d.
- Only the first 24 frames gate the loading screen; the rest stream in behind it.
- A frame that hasn't decoded yet falls back to the nearest loaded neighbour, so
  the canvas holds an image rather than clearing.
- Layout reads (`scrollHeight`, `innerHeight`) are cached on resize instead of
  being read every animation frame.
- The scroll HUD is written straight to the DOM; React state updates only at
  scene boundaries, not once per frame.

## Scenes

| Scene | Frames | Text visible |
|-------|--------|--------------|
| Vision | 1–40 | 4–32 |
| Science | 41–120 | 50–110 |
| Shield | 121–160 | 124–152 |
| Product | 161–200 | 166–196 (spec cards from 176) |

`prefers-reduced-motion` disables the smooth-scroll hijack and the custom
cursor, falling back to native scrolling.
