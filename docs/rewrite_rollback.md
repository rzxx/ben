# Rewrite Rollback Plan

Date: 2026-02-19

## Why this rollback exists

The current rewrite moved too much app behavior into TanStack Query. Query is valuable for true server-state domains (library and stats), but some domains were forced into it and became harder to reason about.

This rollback simplifies ownership and removes accidental complexity.

## Target architecture after rollback

- TanStack Query owns:
  - library pages and details
  - stats overview and dashboard
- Zustand owns:
  - playback runtime and transport state
  - scanner runtime + scanner status/watched-roots state/actions
  - theme mode/runtime flags
- Plain startup hydration owns:
  - initial playback/queue/theme-mode hydration, done once on app start

## Explicit decisions

1. Remove Query bootstrap entirely.
2. Remove theme default-options query.
3. Theme palette cache key is cover-path only.
4. Scanner leaves Query and moves to Zustand/actions.
5. Keep Query for library and stats.

## Scope of removal

Remove or replace the following areas:

- `frontend/src/app/query/bootstrapQueries.ts`
- `frontend/src/app/hooks/useAppBootstrapQuery.ts`
- `frontend/src/app/providers/BootstrapCacheHydrator.tsx`
- bootstrap key usage in `frontend/src/app/query/keys.ts`
- theme default-options key/query usage in:
  - `frontend/src/app/query/keys.ts`
  - `frontend/src/app/query/themeQueries.ts`
  - `frontend/src/app/providers/ThemeStoreProvider.tsx`
  - `frontend/src/app/routes/SettingsRoute.tsx`
- scanner query usage in:
  - `frontend/src/app/query/scannerQueries.ts`
  - `frontend/src/app/routes/SettingsRoute.tsx`
  - any scanner query invalidation paths

## Migration phases

### Phase 1 - Remove bootstrap query path

Goals:

- Stop using bootstrap query as app readiness and shared snapshot transport.
- Hydrate stores from a one-time startup call.

Actions:

1. Add a small startup gateway function that fetches initial shell state once.
2. In provider layer, hydrate playback/theme/scanner initial values via `useEffect` + local loading/error state.
3. Replace `isBootstrapped` query-derived logic with explicit startup-ready state.
4. Remove bootstrap query hook/hydrator and bootstrap query keys.

Acceptance:

- App starts and routes render correctly.
- Playback store hydrates once.
- No bootstrap Query observers remain.

### Phase 2 - Simplify theme extraction flow

Goals:

- Remove options/default-options query complexity.
- Make palette ownership deterministic and easy to invalidate.

Actions:

1. Remove `theme.defaultOptions` query.
2. Keep one static extraction options constant in a single place.
3. Change theme palette key from object options to cover path only.
4. Remove settings UI configurability for extract options.
5. Keep one invalidation path for palette when settings are intentionally changed in future.

Acceptance:

- Theme palette generation works with fixed defaults.
- No theme key serialization based on options objects.
- Theme code has one options source of truth.

### Phase 3 - Move scanner out of Query

Goals:

- Keep scanner model event-driven and local.
- Reduce query invalidation noise for scanner domain.

Actions:

1. Move scanner status/watched-roots fetch logic into scanner store actions.
2. Keep scan progress event binding in scanner event module.
3. Update settings route to consume scanner store state/actions directly.
4. Delete scanner query module and scanner query keys.

Acceptance:

- Settings scanner section works without Query.
- Progress/status/watched roots update correctly after scanner mutations.
- No scanner query keys/usages remain.

### Phase 4 - Cleanup and hardening

Goals:

- Remove dead code and stabilize post-rollback architecture.

Actions:

1. Remove unused constants/utilities tied to old theme key strategy.
2. Remove stale invalidation branches for deleted domains.
3. Update docs to reflect final ownership model.
4. Run lint/build/tests.

Acceptance:

- `npm run lint` passes.
- `npm run build` passes.
- `go test ./...` passes.
- Docs match code behavior.

## Risks and mitigations

- Risk: startup regression while removing bootstrap query.
  - Mitigation: keep startup gateway response minimal and hydrate once.
- Risk: scanner UI state drift after move off Query.
  - Mitigation: centralize scanner actions in store and keep event wiring explicit.
- Risk: theme behavior regressions during options removal.
  - Mitigation: lock fixed defaults and verify palette render/update with track changes.

## Verification checklist

- Startup:
  - app shows shell quickly
  - no duplicate first-route data fetches from bootstrap handoff
- Library:
  - albums/artists/tracks/detail queries still work and prefetch remains functional
- Scanner:
  - add/remove/toggle watched roots works
  - scan trigger and progress updates work
- Theme:
  - mode switching works
  - cover change updates palette
  - no settings-based theme option controls remain
- Stats:
  - stats route polling works
  - playback events still refresh stats data as intended

## Done criteria

- Query is used only where it clearly adds value (library + stats).
- Bootstrap and scanner are no longer Query-owned.
- Theme extraction flow is simplified to fixed defaults + cover-path keying.
- App behavior parity is maintained with lower architectural complexity.
