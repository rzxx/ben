# Phase 2 Rewrite Plan (Zustand v5 + TanStack Query)

## Goal

Do a full state-layer rewrite now so the app can support harder features later without architectural drag.

This plan keeps the new app shell and route split from Phase 2, but replaces provider-owned business state with:

- Zustand for client/app state and high-frequency runtime state.
- TanStack Query for server state (Wails service reads/writes).
- Tiny DI providers for store/query injection boundaries only.

## Current State Snapshot

### Foundation status

- Query client, default options, query key factory, and gateway modules exist.
- Playback already uses modern scoped Zustand pattern (`createStore` + `useStore(store, selector)`) and event-driven sync module.
- Query option builders (`libraryQueries`, `statsQueries`, `scannerQueries`, `themeQueries`) are implemented.

### Current gaps

- Query builders are consumed in library and stats routes, but scanner/theme query ownership is still incomplete.
- `ScannerProvider` and `ThemeProvider` still own large business state via `useState` + effects.
- `LibraryProvider` is now largely legacy/dead path and should be removed during cleanup.
- Provider tree is still heavy and business-state-centric, not DI-only.
- Playback hot/cold split exists, but some selectors recombine hot progress into broad player objects, causing wider rerenders than needed.

### Rewrite state

- Phase 2R-0: mostly done (foundation is present, but not consistently consumed).
- Phase 2R-1: partially done (store/events landed; selector usage still needs tightening).
- Phase 2R-2: mostly done (library + detail routes are query-driven).
- Phase 2R-3: in progress (scanner runtime/event split underway; full scanner provider removal pending).
- Phase 2R-4: pending.
- Phase 2R-5: pending.

### Architecture status checklist

- Playback (store topology + selectors): partial.
- Library routes/details via query: mostly done.
- Scanner via query + runtime slice: in progress.
- Stats via query + scoped polling: mostly done.
- Theme via query + tiny store split: pending.
- Legacy context/provider removal: pending.

## What Zustand v5 Docs Changed for Our Direction (via btca)

- Prefer modern scoped stores: React context + vanilla `createStore` + `useStore(store, selector)`.
- Avoid legacy `zustand/context` patterns in v5.
- Use selectors everywhere and keep selector outputs stable.
- For object/array selectors, use shallow equality (`useShallow` or equality-aware hooks) when needed.
- Prefer one bounded store with slices as a default architecture; multiple stores are an exception for strict hot-path isolation.
- For external event sources (Wails events), update store from event modules outside component trees; keep unsubscribe cleanup explicit.

## Architecture Decisions

### 1) State ownership model

- **TanStack Query** owns server state:
  - bootstrap snapshot
  - albums/artists/tracks pages
  - album/artist detail
  - stats overview/dashboard
  - watched roots and scanner status snapshots
  - theme default options and generated palette requests
- **Zustand** owns client/runtime state:
  - playback transport flags and derived UI state
  - player progress hot slice (position/duration)
  - theme mode preference and shader runtime flags
  - local UI flags (sidebar tabs, debug toggles)
- **Local React state** only for view-local ephemeral inputs.

### 2) Store topology

- Default policy: bounded domain store + slices.
- Exception policy: keep separate hot progress store for playback ticker if selector discipline alone is not sufficient.
- Whichever topology is used, components must subscribe to minimal selectors (no broad composite subscriptions on hot paths).

### 3) Tiny DI providers

- Keep providers only as dependency injection boundaries:
  - `QueryClientProvider`
  - small `*StoreProvider` wrappers that expose store instances via context
- Providers do not own business state with large `useState` + `useMemo` value objects.
- Store instances in providers should be created once per provider lifetime (use `useRef` pattern).

### 4) Typed service gateway

- Keep typed frontend data gateway wrapping generated Wails bindings.
- No direct string-based RPC calls in feature code.
- Gateway handles:
  - cancellation wiring
  - error normalization
  - event constants
  - retry/backoff policy defaults (where appropriate)

### 5) Event-driven sync

- Wails events update Zustand runtime slices directly.
- Events invalidate scoped TanStack Query keys when snapshots become stale.
- Event subscription wiring stays outside feature component trees.

### 6) Selector and subscription discipline

- Use selector hooks everywhere; no whole-store subscriptions in feature components.
- Avoid selectors that create new objects/arrays on every render unless shallow equality is used.
- Keep action references stable.
- Avoid recombining hot ticker state into broad composite objects used by non-player views.

## Target Folder Shape

```txt
frontend/src/app/
  providers/
    AppProviders.tsx
    QueryProvider.tsx
    PlaybackStoreProvider.tsx
    ThemeStoreProvider.tsx
    UIStoreProvider.tsx
  state/
    playback/
      playbackStore.ts
      playbackProgressStore.ts
      playbackSelectors.ts
      playbackEvents.ts
    theme/
      themeStore.ts
    ui/
      uiStore.ts
  query/
    client.ts
    keys.ts
    options.ts
    libraryQueries.ts
    statsQueries.ts
    scannerQueries.ts
    themeQueries.ts
  services/
    gateway/
      libraryGateway.ts
      playbackGateway.ts
      scannerGateway.ts
      statsGateway.ts
      themeGateway.ts
      bootstrapGateway.ts
```

## Migration Phases

## Phase 2R-0: Foundation (Tighten and adopt)

- Keep existing Query packages, client defaults, key factory, gateways, and domain error normalization.
- Convert any remaining provider-created store instances to one-time `useRef` creation for DI providers.
- Add a short architecture status checklist in docs (done/partial/pending by domain) to prevent drift.

Exit criteria:

- App boots with Query provider.
- All new data access goes through gateways.
- DI providers follow one-time store instance creation.

## Phase 2R-1: Playback hardening (highest ROI)

- Keep split playback stores (`playbackStore` cold + `playbackProgressStore` hot) for now.
- Tighten selector usage:
  - action-only consumers subscribe only to actions
  - progress UI subscribes only to progress selectors
  - non-progress views avoid broad player object subscriptions
- Refactor broad selectors/compositions that merge hot and cold state for general consumers.
- Keep event subscriptions in dedicated playback event module.
- Continue targeted stats query invalidation on playback/queue state transitions.

Exit criteria:

- Playback controls parity retained.
- Ticker updates rerender only progress-critical consumers.
- No broad playback selector in non-player route trees.

## Phase 2R-2: Library + Details via TanStack Query

- Replace library provider fetch/effect logic with queries:
  - albums list query for initial route
  - artists/tracks queries lazily on route demand
  - album detail and artist detail queries keyed by route params
  - artist top tracks query keyed by artist
- Use prefetch on route intent/hover where valuable.
- Move scan-completion refresh from manual effect chains to targeted invalidation.

Exit criteria:

- Library routes are query-driven.
- No provider-owned list/detail state remains.

## Phase 2R-3: Scanner + Stats rewrite

- Scanner:
  - watched roots and scanner status become query-backed
  - scanner progress event updates a tiny scanner runtime slice
  - scan trigger mutation invalidates related queries on completion
- Stats:
  - overview/dashboard become query-backed
  - polling active only on stats route via query controls
  - playback event invalidation keeps overview fresh without broad rerenders

Exit criteria:

- Settings and stats screens consume queries + minimal runtime slices.
- Manual request token/cancel bookkeeping in providers is removed in favor of query lifecycle.

## Phase 2R-4: Theme + Shader pipeline

- Keep shader technical runtime in Zustand.
- Move theme defaults and palette generation to query/mutation hooks.
- Keep theme mode preference and resolved mode in a tiny Zustand theme store.
- Preserve post-paint/idle shader activation as progressive enhancement.

Exit criteria:

- Theme behavior parity retained.
- No legacy theme context provider business state remains.

## Phase 2R-5: Remove legacy contexts and cleanup

- Remove `*Context.ts` and large `*Provider.tsx` business-state files.
- Keep only tiny DI providers and feature hooks.
- Remove transitional adapters and dead code paths.
- Update docs and architecture notes.

Exit criteria:

- No feature code depends on old context contracts.
- Build and lint pass.

## Query Key and Invalidation Contract

- Query keys are centralized and typed.
- Event-to-invalidation map is explicit:
  - `player:state` and `queue:state` -> invalidate stats overview/dashboard keys.
  - `scan:progress completed` -> invalidate albums/artists/tracks/detail keys.
  - watched-root mutations -> invalidate watched-roots + scanner status keys.
- Avoid broad `invalidateQueries()` without key scope.

## Zustand Design Rules (v5)

- Scoped stores use React context + vanilla `createStore` + `useStore(store, selector)`.
- Selectors must be stable; avoid creating fresh object/array/function values in selectors.
- Use shallow-equality selector helpers when selecting object/array tuples.
- Keep action references stable and directly selectable.
- Keep stores framework-agnostic (no JSX in stores).
- Keep hot vs cold state isolated; do not mix ticker fields with static metadata in broad selectors.

## Performance Budgets (must hold after rewrite)

- Startup path fetches only bootstrap + first-route-critical data.
- Playback ticker updates do not rerender route trees.
- Stats polling active only on stats route.
- Query cache memory remains bounded (configured `gcTime`, key discipline).
- Sidebar/detail/settings views do not rerender on every ticker update unless explicitly subscribing to progress.

## Testing and Verification

- Unit tests:
  - store actions and derived selectors
  - gateway error shaping
  - query key factories
  - selector stability for hot playback paths
- Integration tests/manual checks:
  - playback controls and seek coalescing
  - route navigation with lazy query loading
  - scanner completion -> library refresh
  - stats refresh on playback state changes
- Perf checks:
  - render count checks for `PlayerBar`, queue panel, and non-player routes
  - startup RPC/query count vs baseline

## Risks and Mitigations

- **Risk:** Migration churn across many hooks.
  - **Mitigation:** Keep temporary adapter hooks that mirror old names until cutover.
- **Risk:** Over-invalidation causing network/RPC noise.
  - **Mitigation:** Central invalidation map + query key tests.
- **Risk:** Selector instability causing rerender loops/noise.
  - **Mitigation:** enforce selector rules and shallow-equality patterns in hot paths.
- **Risk:** Store sprawl.
  - **Mitigation:** enforce domain folder boundaries and explicit slice ownership.

## Definition of Done

- All domain business state moved off large React context values.
- TanStack Query is the single server-state source.
- Zustand is the single client/runtime-state source.
- Providers are tiny DI wrappers only.
- Legacy provider/context business-state files removed.
- Build/lint pass and manual parity checks pass.

## Rollout Strategy

- Do rewrite work on a dedicated branch.
- Land in vertical slices (playback -> library -> scanner/stats -> theme).
- Keep app runnable at every milestone; avoid a single giant final merge.
- At each milestone, verify selector/rerender budget before moving to next domain.
