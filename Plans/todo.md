## CURRENT TASK:

## BACKLOG:

## REFACTOR NEEDED:

-- Replace the sandbox boolean flag zoo (gridFloorBelt, roomNode, puzzleTemplate, …) and every isXSpawnAsset predicate with a single spawnKind (or placeableKind) on each catalog asset — e.g. "floorBelt", "powerSource", "roomNode", "prop", "poolRack" — plus small kind-specific params (floorBeltKind, rack variant) where needed. Register spawn, preview, inspector UI, scene list, and snapshot behavior once in the placeable registry keyed by that kind (asset points at kind, registry owns handlers); delete isGridFloorBeltSpawnAsset, isSingleWorldPropSpawnAsset, resolveFloorBeltKindFromSpawnAsset's switch, and the duplicate if-chains in preview/spawn inspector/snapshot. Migration: set spawnKind on each \*.asset.js, remove the old booleans, grep until the predicates are gone.

-- duplicate work in hot loops and parallel abstractions are. UI-side, virtual lists fixed DOM cost but refreshPanel still rebuilds every section and re-sorts the full scene list on every sync — dirty flags on placement/selection would be the next library-level win there, separate from physics.

-- Bigger dedupe targets: three visibility models doing the same job (viewport.isVisible in nav/render, entityRegistry.queryView in overlays/draw, isPropNavVisible as a one-off wrapper) — one “in sim view bounds?” helper keyed off boundsQuery/boundsVisibleWide would unify overlay culling and off-screen replan/sleep policy.

## 06/18/2026

10:48 AM: Physics + snake passes

7:27 PM: Lots of time wasted on belts. Physics + wall damage PR.

## MILESTONE LOG

| DATE       | MILESTONE                                                                           |
| ---------- | ----------------------------------------------------------------------------------- |
| 2026-06-17 | **Primitives/Phyiscs Phase 1** - circle and 3+ verts covered, basic glass fractures |
| 2026-06-16 | **Integrated pathfinding system to web worker**                                     |
| 2026-06-14 | **Integrated pathfinding system** - region + flow + edge + cell + boundary          |
| 2026-06-13 | **Passage power network**                                                           |
| 2026-06-XX | **Forcefields**                                                                     |
| 2026-06-XX | **Belts**                                                                           |
| 2026-06-XX | **4 way edge graph**                                                                |
| 2026-06-XX | **Sandbox JSON import/export**                                                      |

## LOG

## 06/18/2026

9:13 AM: RTS interface 3 part PR.

9:39 AM: In-game interface refactor 3 part PR.

11:14 AM: Physics sleep/pipeline/routing 3 part PR.

12:08 PM: Connected kinetics 3 part PR.

1:03 PM: Snake game 3 part PR.

2:03 PM: Multi snakes, physics needle push.

3:35 PM: Prop consolidation, tinting, UI pass.
