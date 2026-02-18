# Profiling Result: Startup Black Screen

Date: 2026-02-19  
Trace analyzed: `Trace-20260219T005610.json` (DevTools Performance trace)

## Scope

Goal: identify why app startup shows a black screen for ~1s on weak laptop and ~300ms on powerful PC.

## Key Timing Markers (from trace)

- `navigationStart`: ~158.482ms (relative to trace window start)
- `firstPaint`: ~914.502ms
- `firstContentfulPaint`: ~914.502ms
- `loadEventEnd`: ~968.300ms

Derived:

- `navigationStart` -> `FCP` ~= **756ms**
- Renderer main thread busy time in that window ~= **725ms** (near-saturated main thread)

## Primary Findings

1. **Main-thread JS work dominates startup before first paint**
   - Largest startup task: `RunTask` ~= **396ms** at ~470ms rel.
   - Dominant nested work is React scheduler execution:
     - `FunctionCall` / `v8.callFunction`
     - function: `performWorkUntilDeadline`
     - source: `react-dom_client.js`
   - Additional long scheduler chunks before/around first paint:
     - ~102ms, ~96ms, ~63ms, ~49ms.

2. **Black screen is real host background during blocked first paint**
   - Earliest screenshot frame is effectively uniform dark frame.
   - Window background color is explicitly dark in backend startup config:
     - `main.go:126` -> `BackgroundColour: application.NewRGB(10, 10, 10)`
   - While renderer is busy before first paint, user sees this dark background.

3. **Dev-mode profiling overhead inflates absolute time (but does not remove bottleneck)**
   - Trace includes dev server artifacts (`@vite/client`, HMR paths).
   - Trace also includes profiler startup overhead:
     - `CpuProfiler::StartProfiling` ~= **153ms** near startup.
   - Meaning: raw numbers are somewhat inflated, but startup is still clearly main-thread constrained.

4. **Eager startup work in app code contributes directly to long pre-paint work**
   - `frontend/src/main.tsx` mounts app inside `React.StrictMode` (dev double-invocation behavior).
   - `frontend/src/App.tsx` initializes many async flows immediately in first effect (`Promise.all`):
     - watched roots, scanner status, queue state, player state,
     - stats overview,
     - theme defaults,
     - library data.
   - `frontend/src/App.tsx` imports many route/view modules eagerly (large initial module graph).

5. **Background shader startup is on critical path and visible in expensive layout stacks**
   - Expensive `UpdateLayoutTree` / `Layout` events include stacks through:
     - `BackgroundShader.tsx`
     - `backgroundShaderRenderer.ts` (`resizeCanvas`, `initialize`, render path).
   - Startup network includes many shader/GLSL module loads early.

6. **Startup request profile confirms heavy early fan-out**
   - In first ~1.5s:
     - Many module requests (features + shared + shader GLSL modules).
     - Repeated `/wails/runtime` requests.
     - Early `/covers` requests.

## Concrete Weak Point

The startup weak point is **critical-path main-thread saturation before first paint**, caused by a combination of:

- eager React mount/render work,
- broad initial app initialization,
- eager module graph (including non-critical routes/components),
- shader initialization/layout work,
- plus dev/profiler overhead.

This produces a visible black screen because the native window background is dark until first paint lands.

## Recommended Fixes (Priority Order)

1. **Defer non-critical initialization after first paint**
   - Keep only strictly required data for initial route.
   - Move non-essential calls out of initial `Promise.all` in `App.tsx`.

2. **Code-split and lazy-load route views/components**
   - Avoid importing all route modules at initial boot.
   - Load non-active routes on demand.

3. **Defer `BackgroundShader` initialization**
   - Render lightweight fallback first.
   - Initialize shader after first paint / idle.

4. **Reduce dev-only startup overhead during profiling comparisons**
   - Compare with production build trace to isolate true user-facing startup cost.
   - For diagnostic runs, test with and without `React.StrictMode` in dev.

5. **Improve perceived startup state**
   - Keep intentional boot/splash background instead of blank black frame.
   - This improves perceived performance even if some startup work remains.

## Notes

- This analysis is trace-driven and cross-checked against current code paths.
- Numbers above are from the provided trace and can vary per machine and build mode.
