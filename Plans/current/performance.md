# Codebase Audit Report

## 1. Goal

This report provides an audit of the codebase to identify opportunities where indirection can be reduced, clarity can be improved, and code volume can be minimized. The main focus is on the performance bottlenecks highlighted in the profiling data, as well as maintaining alignment with the established current `hygiene.md` and roadmap rules (particularly around snake agent FSMs, pathfinding, and physics).

## 2. Identified Performance Bottlenecks & Opportunities

### 2.1. `EntityRegistry` & Broadphase Queries

- **Current Issue**: The profiling data shows that `EntityRegistry._fillSpatialViewCandidates` and `queryView` consume a significant amount of CPU time. Currently, `_fillSpatialViewCandidates` iterates over elements that do not fall under spatial frame limits via `_fillAllEntriesOfKinds` doing an O(N) fallback on grid tiles not assigned properly.
- **Opportunity**:
    - Restructure `EntityRegistry` spatial queries so that objects always properly enter the broadphase instead of falling back to full registry iteration.
    - Remove closures or intermediate arrays in `queryView` to reduce garbage collection pressure. Preallocate candidate lists globally or heavily reuse them.

### 2.2. Line of Sight & Perception (`gridCellVision.js`)

- **Current Issue**: `collectVisibleGridCells` and `hasGridCellLineOfSightCached` are eating roughly 8-9% of tick time.
- **Opportunity**:
    - Ensure that vision cache tokens correctly match spatial frames to avoid recomputing identical Bresenham's line checks across multiple agents facing the same quadrant.
    - Inline the `hasGridCellLineOfSightCached` in `collectVisibleGridCells` using local primitive variables to skip bounds checks on every internal ray trace.

### 2.3. Collision Pipeline & SAT Resolution

- **Current Issue**: `runCollisionPipeline` and `getEntityCollisionParts` spend ~7-10% of total time resolving physics.
- **Opportunity**:
    - Remove repetitive destructuring of shape parameters per iteration in `SatCollision.js`.
    - Avoid generating `{ cx, cy, overlap, nx, ny }` object literals in the tight loops of SAT manifold generation. Flatten these out into a shared global float32 array that the pipeline reads from sequentially.
    - Simplify `kineticBodySlab.js` integration. The pipeline copies data back and forth from objects to the slab. Eliminate intermediate representations and just pass the Slab index down to the solvers.

### 2.4. Agent FSM & Passthrough Functions (`hygiene.md` enforcement)

- **Current Issue**: The FSM setup still has some wrapper allocation risk around `GroundNavIntentAdapter.js` and `AgentDecisionContext.js`, even after the larger profile-driven consolidation landed.
- **Opportunity**:
    - Drop remaining adapter/context wrapper objects. Write facts directly into the preallocated decision context where practical.
    - Move FSM effects to operate on shared scalar structs instead of passing complex nested context objects between functions.
    - Inline static configuration getters only where they remove real pass-through; profile schema should remain the source of species policy.

### 2.5. Pathfinding (`flowTargetSteps.js`)

- **Current Issue**: Flow reach step caching `flowReachStaleCache.js` uses an object-oriented map of keys alongside integer arrays.
- **Opportunity**:
    - The stale cache can be simplified to a flat primitive hash map.
    - Pathfinding `readCommittedPathLen` has indirection and null coalescing checks that can be replaced with a strict bit flag on the route object.
    - Avoid object allocations in `FlowFieldGrid` reads.

## 3. Recommended Next Steps

1. **Flatten Collision Data Pipelines**: Begin refactoring `SatCollision` and `kineticBodySlab` to compute overlaps into a globally pre-allocated typed array structure. Eliminate all intermediate object allocations (`{ nx, ny, overlap, ... }`) in the hot loop.
2. **Optimize Grid Cell Vision**: Rework the Bresenham line algorithm inside `hasGridCellLineOfSight` to trace without calling external utility functions like `navTopologyGraphCanStep` on every single step; instead, inline the passability checks.
3. **Refactor FSM Adapter Hot Paths**: Audit `GroundNavIntentAdapter.js` and `AgentDecisionContext.js` for wrapper objects, closures, and pass-through option bags. Keep the shipped profile schema, but write per-tick facts more directly.
4. **Fix EntityRegistry Iteration**: Remove the O(N) fallback in `EntityRegistry`. Guarantee that all items belong to the spatial grid so that `queryView` only iterates over localized `aabb` bounding regions.

By strictly applying the single-dialect and net-negative line count directives from `hygiene.md`, these areas represent the clearest wins for performance and maintainability.
