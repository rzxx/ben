# Phase 2 Rewrite Plan (Zustand + TanStack Query)

## Goal
Do a full state-layer rewrite now so the app can support harder features later without architectural drag.

This plan keeps the new app shell and route split from Phase 2, but replaces provider-owned state with:
- Zustand for client/app state and high-frequency runtime state.
- TanStack Query for server state (Wails service reads/writes).
- Tiny DI providers for store/query injection boundaries.

## Why Rewrite Now
- Current domain boundaries are good, but large context values still cause broad rerenders on frequent updates.
- Playback updates are high-frequency and should use selector-based subscriptions, not context-wide value propagation.
- Future features (queue intelligence, richer stats, background tasks, optimistic actions) need stronger cache/state primitives.
- Doing this now avoids repeated partial migrations later.

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

### 2) Tiny DI providers
- Keep providers only as dependency injection boundaries:
  - `QueryClientProvider`
  - small `*StoreProvider` wrappers that expose store instances via context
- Providers do not own business state with `useState` + large `useMemo` objects.
- Domain hooks read from injected store + selectors.

### 3) Typed service gateway
- Introduce a typed frontend data gateway wrapping generated Wails bindings.
- No direct string-based RPC calls in feature code.
- Gateway handles:
  - cancellation wiring
  - error normalization
  - event constants
  - retry/backoff policy defaults (where appropriate)

### 4) Event-driven sync
- Wails events update Zustand slices directly.
- Events also invalidate related TanStack Query keys when server snapshots become stale.

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

## Phase 2R-0: Foundation
- Add TanStack Query packages and initialize `QueryClient` defaults.
- Define global query defaults:
  - conservative retries for user-triggered actions
  - route-friendly `staleTime` for browse lists
  - explicit `gcTime` to prevent cache bloat
- Add query key factory (`domain + params` shape, no ad hoc keys).
- Add typed gateway modules around all existing bindings.
- Add domain error normalization utility shared by stores and queries.

Exit criteria:
- App boots with Query provider.
- All new data access can go through gateways.

## Phase 2R-1: Playback First (highest ROI)
- Implement Zustand playback stores split by update frequency:
  - `playbackStore` for queue/current track/status/repeat/shuffle/volume/errors.
  - `playbackProgressStore` for position/duration ticker updates.
  - stable action layer calling playback/queue gateways.
- Move event subscriptions out of React component trees into dedicated playback event module.
- Update `PlayerBar`, queue panel, and route actions to selector hooks:
  - action-only consumers subscribe only to actions.
  - progress UI subscribes only to progress slice.
- Connect playback state changes to query invalidation for dependent stats queries.

Exit criteria:
- Playback controls work parity with previous behavior.
- Ticker updates rerender only playback/progress consumers.

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
  - watched roots and scanner status become query-backed.
  - scanner progress event updates a tiny Zustand scanner runtime slice.
  - scan trigger mutation invalidates related queries on completion.
- Stats:
  - overview/dashboard become query-backed.
  - polling only active on stats route via query refetch controls.
  - playback event invalidation keeps overview fresh without broad rerenders.

Exit criteria:
- Settings and stats screens consume queries + minimal runtime slices.

## Phase 2R-4: Theme + Shader pipeline
- Keep shader technical runtime in Zustand (already aligned).
- Move theme defaults and palette generation to query/mutation hooks.
- Keep theme mode preference and resolved mode in a tiny Zustand theme store.
- Ensure shader activation remains post-paint/idle progressive enhancement.

Exit criteria:
- Theme behavior parity retained.
- No legacy theme context provider state remains.

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

## Store Design Rules
- Use selector hooks everywhere; no whole-store subscriptions in feature components.
- Keep action references stable.
- Avoid creating new objects in selectors unless using shallow compare.
- Keep stores framework-agnostic where possible (no JSX inside stores).
- Split hot vs cold state; do not mix ticker fields with static metadata.

## Performance Budgets (must hold after rewrite)
- Startup path fetches only bootstrap + first-route-critical data.
- Playback ticker updates do not rerender route trees.
- Stats polling active only on stats route.
- Query cache memory remains bounded (configured `gcTime`, key discipline).

## Testing and Verification
- Unit tests:
  - store actions and derived selectors
  - gateway error shaping
  - query key factories
- Integration tests/manual checks:
  - playback controls and seek coalescing
  - route navigation with lazy data loading
  - scanner completion -> library refresh
  - stats refresh on playback state changes
- Perf checks:
  - render count checks for `PlayerBar` and queue panel
  - startup RPC/query count vs baseline

## Risks and Mitigations
- **Risk:** Migration churn across many hooks.
  - **Mitigation:** Keep temporary adapter hooks that mirror old names until cutover.
- **Risk:** Over-invalidation causing network/RPC noise.
  - **Mitigation:** Central invalidation map + query key tests.
- **Risk:** Store sprawl.
  - **Mitigation:** enforce domain folder boundaries and slice ownership.

## Definition of Done
- All domain business state moved off large React context values.
- TanStack Query is the single server-state source.
- Zustand is the single client/runtime-state source.
- Providers are tiny DI wrappers only.
- Legacy provider/context files removed.
- Build/lint pass and manual parity checks pass.

## Rollout Strategy
- Do rewrite work on a dedicated branch.
- Land in vertical slices (playback -> library -> scanner/stats -> theme).
- Keep app runnable at every milestone; avoid a single giant final merge.
