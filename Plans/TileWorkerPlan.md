# Tile worker OOP refactor

Tile surface bakes now follow the same shape as HPA / flow-field workers: **pool host → scheduler/client → worker entry class**.

## Status

| Part | Module                                                                   | Status |
| ---- | ------------------------------------------------------------------------ | ------ |
| 1    | `Libraries/Workers/PromiseWorkerPoolHost.js`                             | ✅     |
| 2    | `Libraries/WorldSurface/TileBakeScheduler.js` (queue, dedupe, `stats()`) | ✅     |
| 3    | `TileSurfaceWorkerClient` + `TileSurfaceWorker` + coordinator shim       | ✅     |

## Architecture

```text
TileWorkerCoordinator (shim)
  └── TileSurfaceWorkerClient
        ├── PromiseWorkerPoolHost
        └── TileBakeScheduler

TileWorkerEntry.js
  └── TileSurfaceWorker.onMessage → WorldSurfacePainter
```

Message types: `Libraries/WorldSurface/TileWorkerMessages.js`

## Telemetry

- `TileBakeScheduler.stats()` — `{ queueSize, pendingCount, inFlightDedupeCount, busyWorkers }`
- `TileWorkerCoordinator.bakeSchedulerStats()` — delegates to client; zeros before bootstrap

## Next (worker perf — not Part 3)

Profile hot path: `TileSurfaceWorker.onMessage` → `composeSurfaceImage` → `Perlin2D` → motif filters. Part 3 only structured the entry point; perf work targets `WorldSurfacePainter` / `SurfaceTextureComposer` / `Perlin2D` with bake session state on `TileSurfaceWorker`.

## Tests

- `tests/promiseWorkerPoolHost.test.js`
- `tests/tileBakeScheduler.test.js`
- `tests/tileSurfaceWorkerClient.test.js`
