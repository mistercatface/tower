## CURRENT TASK:

## BACKLOG:

## REFACTOR NEEDED:

scratch class/file?

interface sprite cache (selection rings, drag launch indicators, etc)

Replace the sandbox boolean flag zoo (gridFloorBelt, roomNode, puzzleTemplate, …) and every isXSpawnAsset predicate with a single spawnKind (or placeableKind) on each catalog asset — e.g. "floorBelt", "powerSource", "roomNode", "prop", "poolRack" — plus small kind-specific params (floorBeltKind, rack variant) where needed. Register spawn, preview, inspector UI, scene list, and snapshot behavior once in the placeable registry keyed by that kind (asset points at kind, registry owns handlers); delete isGridFloorBeltSpawnAsset, isSingleWorldPropSpawnAsset, resolveFloorBeltKindFromSpawnAsset's switch, and the duplicate if-chains in preview/spawn inspector/snapshot. Migration: set spawnKind on each \*.asset.js, remove the old booleans, grep until the predicates are gone.

## MILESTONE LOG

| DATE       | MILESTONE                                                                  |
| ---------- | -------------------------------------------------------------------------- |
| 2026-06-16 | **Integrated pathfinding system to web worker**                            |
| 2026-06-14 | **Integrated pathfinding system** - region + flow + edge + cell + boundary |
| 2026-06-13 | **Passage power network**                                                  |
| 2026-06-XX | **Forcefields**                                                            |
| 2026-06-XX | **Belts**                                                                  |
| 2026-06-XX | **4 way edge graph**                                                       |
| 2026-06-XX | **Sandbox JSON import/export**                                             |
