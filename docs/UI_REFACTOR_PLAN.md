# UI Refactor Plan

## Goals

- Replace the current crowded UI with a clean, modular app shell.
- Keep visual styling intentionally light so design iteration can happen later.
- Improve playback flow behavior to match Spotify-like queue expectations.
- Move queue-building logic into backend services so frontend stays simple.
- Use Tailwind CSS only, Lucide icons only, and Base UI for sliders.

## Layout Target

- Left sidebar
  - Brand title: `ben`
  - Navigation buttons (Albums, Artists, Tracks, Settings)
  - Scan controls (incremental/full)
- Main content area
  - Albums grid (default)
  - Album detail view
  - Artists grid
  - Artist detail view
  - Tracks list view
- Right sidebar (multi-purpose)
  - Top tab switcher: Queue / Track Details
  - Queue list panel
  - Current track metadata panel
- Bottom fixed player
  - Does not overlap sidebars/content
  - Left: cover + title + artist
  - Center: shuffle/back/play/next/repeat controls + seek slider
  - Right: volume slider

## Behavior Requirements

### Album Flow

- Click album in grid -> open Album Detail view.
- `Play Album` button:
  - Reset queue
  - Queue full album track order
  - Start playback from first track
- Play a specific album track:
  - Reset queue
  - Queue album tracks starting from clicked track
  - Skip tracks before clicked one

### Artist Flow

- Click artist in grid -> open Artist Detail view.
- Artist header includes:
  - Artist name
  - Album count + track count summary
  - `Play Artist Songs` button
- `Play Artist Songs` button:
  - Reset queue
  - Queue all artist tracks by album order: newest album -> oldest album
- Top liked tracks block (5 items, from stats)
  - Play clicked top track:
    - Reset queue
    - Start queue at clicked track within stats-ranked order (most listened -> least)
    - Skip all tracks ranked above clicked one
    - Append remaining no-stats tracks ordered by newest album -> oldest album
    - Do not duplicate tracks
- Show artist albums grid under top-liked section.

## Technical Plan

### Phase 1: Backend API Extensions

- Add library service methods for queue-building:
  - album full queue IDs
  - album queue IDs from selected track
  - artist full queue IDs (newest -> oldest)
  - artist queue IDs from selected top track (stats-ranked start behavior)
  - artist top tracks (stats-backed)
- Keep query/order logic in repository layer.
- Add tests for ordering and edge cases.

### Phase 2: Frontend Shell Refactor

- Replace current top-nav + panels with 3-column shell and fixed player.
- Keep route structure simple (Albums/Artists/Tracks/Settings).
- Remove search UI from primary flow.

### Phase 3: Modular Components

- Split view logic into focused components:
  - left sidebar
  - right sidebar (queue/details tabs)
  - albums grid + album detail
  - artists grid + artist detail
  - tracks list
  - bottom player
- Keep data orchestration in `App.tsx`, rendering in feature components.

### Phase 4: Tailwind + UI primitives

- Remove legacy custom CSS styling.
- Keep `theme.css` as Tailwind entry only.
- Use Tailwind utilities for all component layout and spacing.
- Use Lucide icons for controls.
- Use Base UI Slider for seek and volume controls.

### Phase 5: Validation

- Run and fix:
  - `bun run lint`
  - `bun run build:dev`
  - `go test ./...`
- Manual behavior checks for album/artist queue flows and fixed-player layout.
