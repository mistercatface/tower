# Grid contract — shared substrate

The uniform grid is the **single source of truth** for walkability, static collision, floor semantics, perception LOS, and wall rendering. Every subsystem either **writes** grid state (stamps/edits) or **reads** baked views (topology, caches). This doc is the contract; implementation detail lives in spoke docs.

**Related:** pathfinding topology → [pathfinding.md](../pathfinding.md) Tier 0 · procgen stamps → [procedural.md](../procedural.md) · naming → [glossary.md](../glossary.md)

---

## Core types

| Type | Path | Holds |
|---|---|---|
| `WorldObstacleGrid` | `Libraries/Spatial/grid/WorldObstacleGrid.js` | Voxel occupancy `grid[]`, `edgeStore` (rails/passages), `floorStore` (belts/buttons), revision counters |
| `NavTopology` | `Libraries/Navigation/NavTopology.js` | Baked walkability: `navCardinalOpen`, `vertexPassability`, wall revision snapshot |
| `NavRuntime` | `Libraries/Navigation/NavRuntime.js` | Worker sync, `commitEdit`, topology key, session invalidation |
| Epoch spine | `Libraries/Spatial/grid/gridNavEpoch.js` | `bumpGridNavEpoch`, `gridNavCacheKey` — canonical staleness key |

---

## What lives on the grid

| Layer | Representation | Blocks movement when |
|---|---|---|
| **Voxel fill** | `grid[idx] !== 0` | Cell occupied by solid mass (CA caves, static walls) |
| **Rail / passage edges** | `edgeStore` + `boundaryOccupancy` | `boundaryBlocksStep` / `boundaryBlocksStepFrom` |
| **Floor cells** | `floorStore` (belts, buttons, …) | Belt entry rules, lateral belt rails |
| **Passage power** | Edge power network + `_passagePowerNavKey` | Forcefield edges when unpowered |
| **Kinetic props** | Entity registry (not grid cells) | Physics broadphase — **not** written into grid occupancy today |

Pick **one primary wall representation per chunk** (voxel vs rail). Mixing without open seams breaks LOS and nav. → [glossary.md](../glossary.md#voxel-fill-vs-rail-walls)

---

## Revision & staleness

Live edits bump epoch channels, then consumers compare `gridNavCacheKey(grid)`:

```text
gridNavCacheKey = wallGridRevision : gridTopologyEpoch : floorNavEpoch : passagePowerNavKey
```

| Channel | `bumpGridNavEpoch` | Invalidates |
|---|---|---|
| `Wall` | voxel + structure z-level caches | nav topology bake |
| `Floor` | belt/button floor edits | nav topology bake |
| `Topology` | edge/boundary graph changes | topology epoch only |

**Consumers that must refresh when key changes:**

| Consumer | Readiness check |
|---|---|
| HPA worker topology arena | `gridNavCacheKey === worker._syncedNavCacheKey`, no pending `_navSyncPromise` |
| `NavRuntime.isTopologyCurrent()` | `syncedTopologyKey()` matches live key |
| Per-agent HPA replan | `navSession.topologyKey !== nav.topologyKey()` |
| Flow field grid | keys off `gridNavCacheKey` in `FlowFieldGrid` |
| HPA region graph (worker) | `worker._graphEpoch >= nav.graphSyncGeneration` |

Source comment: `gridNavEpoch.js` header table.

---

## Edit → commit pipeline

All gameplay geometry edits should follow this spine:

```text
1. STAMP / MUTATE
   procgen, editor tool, or runtime system writes grid
   (stampStaticWalls, setBoundary/railWall, grid.writeFloorCell, …)

2. BUMP EPOCH
   bumpGridNavEpoch(grid, Wall | Floor | Topology) on the grid object

3. COMMIT NAV EDIT
   commitGridNavEdit(state, damageBounds, { fullNavSync? })
     → worldSurfaces.invalidateGridBounds (render wall/floor caches)
     → markGridZoneSubscriptionsDirty (floor tick zones)
     → rebuildLabMapCaches (editor minimap — when editor/launch active)
     → NavRuntime.commitEdit → worker topology patch or full sync

4. DOWNSTREAM READ (same or next frame)
   NavTopology baked / worker synced
   HPA replans on topologyKey change
   Perception LOS uses current boundary + voxel state
   Render draws from invalidated surface regions
```

**Helpers:** `Libraries/Sandbox/gridNavEdit.js` — `applyFloorCellEdit`, `clearFloorCellNavEdit`, `commitGridNavEditUnion`.

**Full-scene procgen** (snake scene, lab map gen): often `commitGridNavEdit(state, null, { fullNavSync: true })` after large stamps.

---

## Consumer matrix (who reads / writes)

| Subsystem | Writes | Reads |
|---|---|---|
| **Procgen / Mazes** | voxels, rails, floor belts in recipes | walkable index before commit |
| **Room graph bake** | perimeter rails, corridor masks, belts | corridor A* during bake only |
| **Sandbox editor** | wall/floor/boundary edits via tools | selection overlays, inspectors |
| **Physics broadphase** | — | static wall proxies from grid; kinetic entities separate |
| **Nav / HPA / flow** | — | `NavTopology`, worker SAB, `canStep` |
| **Agent perception** | — | `gridCellVision`, LOS on boundary graph |
| **Render wall atlas** | — | `worldSurfaces` chunk bakes keyed on grid revision |
| **Grid zone tick** | — | floor subscriptions (belts, buttons) after commit |

Generation **writes**; pathfinding **routes**; rendering **draws**; AI **judges** — see [procedural.md](../procedural.md) scope table.

---

## Stamp order (typical recipes)

Order matters when layers interact:

1. **Expand grid bounds** if recipe exceeds current cols/rows
2. **Voxel fill** (CA, static walls) — if chunk uses voxel mass
3. **Rail / boundary graph** — edge rails, passages (not fake voxels)
4. **Floor cells** — belts, buttons (may sync belt edges into boundary store)
5. **Kinetic / props** — placed entities (separate from grid occupancy)
6. **`commitGridNavEdit`** — once per recipe pass (union bounds)
7. **`navWalkable.rebake()`** — when using walkable index helpers outside NavRuntime path
8. **Runtime obstacle commit** — snake game hooks nav walkable after scene spawn

Snake split map: cavern stamp → rail maze stamp → commit → agents spawn. → [games/snake.md](../games/snake.md#scene--procgen-hook)

---

## Known gaps & partial resync

Documented engineering debt — not theoretical:

| Gap | Symptom | Where tracked |
|---|---|---|
| **Single-cell belt edit resync** | Some belt placements may not trigger full obstacle generation until next wall sync | [pathfinding.md](../pathfinding.md) Tier 8 |
| **Dynamic kinetic occupancy** | Moving snake bodies affect physics, not grid `canStep` | ROADMAP §4.1 future |
| **Manual room + puzzle RNG** | Snapshot edits break full seed reproducibility | [procedural.md](../procedural.md) Tier 10 |
| **Passage power key** | Separate `_passagePowerNavKey` in cache key — power network edits must update it | `setGridPassagePowerNavKey` |

When adding a new grid mutator: always bump the correct epoch channel and route through `commitGridNavEdit` (or document why not).

---

## Checklist for new grid writers

- [ ] Which layer? voxel / edge / floor — bump matching epoch
- [ ] Return or union `damageBounds` for localized commit
- [ ] Call `commitGridNavEdit` (don't assume next frame fixes staleness)
- [ ] If touching belts + rails in one op, use `commitGridNavEditUnion`
- [ ] Tests: assert nav topology ready (`isNavTopologyReady`) before path/vision assertions

---

## Key files

```text
Libraries/Spatial/grid/
  WorldObstacleGrid.js, gridNavEpoch.js, boundaryOccupancy.js
  FloorCell.js, FloorCellStore.js, navGridMutations.js, gridCellTopology.js
Libraries/Navigation/
  NavRuntime.js, NavTopology.js
Libraries/Sandbox/
  gridNavEdit.js, gridWallEdit.js, boundaryEdit.js, deferredGridWallCommit.js
Libraries/Pathfinding/
  navTopologySab.js, hpaPathSlot.js, FlowFieldGrid.js
```

*This doc satisfies ROADMAP §4.1 “document the grid consumer contract.” Keep it updated when adding mutators or consumers.*
