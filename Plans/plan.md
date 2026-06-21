## PHYSICS

1. Implicit Free Lists for Branchless Sleep Management Checking if (slab.islandAsleep[i]) continue; thousands of times per frame inside hot loops destroys CPU pipeline efficiency through branch mispredictions. Instead of iterating over everything and skipping what is asleep, we can use an Implicit Free List (or array partitioning) to physically segregate memory. We maintain an activeConstraintCount pointer. When an island falls asleep, we execute a fast O(1) swap, moving its bodies and constraints to the end of the arrays and decrementing the active counter. The solver loops then simply become for (let i = 0; i < activeConstraintCount; i++). Sleeping objects mathematically cease to exist from the solver’s perspective—zero branching, zero iterations, and zero CPU cycles wasted on dormant physics.

2. Full Structure-of-Arrays (SoA) for Rigid Bodies While the kineticConstraintSlab beautifully applies Data-Oriented Design to constraints, it still resolves body velocities via object pointers (bodyA.vx, bodyB.vy). This forces the CPU to chase memory references across the heap, triggering L1 cache misses. The natural evolution is to flatten the entire active kinetic body pool into a unified Float32Array architecture (bodyVx, bodyVy, bodyInvMass). By resolving bodies entirely via integer indices inside the solver loop, we guarantee 100% linear memory access. Modern JavaScript JIT compilers (like V8) can aggressively unroll and vectorize these typed-array loops, easily yielding a 2x to 3x raw throughput multiplier for the core velocity solver.

3. Persistent Constraint Graphs & Manifold Caching Currently, the engine incurs a massive O(N) penalty every tick by completely tearing down and rebuilding the constraint slabs and wall candidate arrays. Physics engines fundamentally benefit from "temporal coherence"—objects mostly stay exactly where they were a millisecond ago. By upgrading to a Persistent Constraint Graph, the engine caches the topological network of contacts and joints. Instead of rebuilding arrays every frame, the system only patches the graph when a new collision begins, an old contact separates, or an island wakes up. This transforms the heaviest setup phases of the pipeline from a brute-force "recalculate everything" model into a lightweight "only update the delta" architecture.

4. Graph Coloring for Accelerated Solver Convergence Iterative constraint solvers process joints sequentially, meaning the array's order heavily biases the physical outcome (causing stretchy chains or uneven forces). By applying a greedy Graph Coloring algorithm to the constraint network during the gather phase, we can group constraints into independent "colors" where no two constraints share the same body. Solving all constraints of Color A, then Color B, mathematically guarantees zero memory contention between joints. This independence drastically accelerates solver convergence—meaning you get rock-solid, stiff physics in half the iterations. As a massive bonus, this colored independence perfectly sets up the physics engine to be multithreaded across Web Workers without race conditions.

5. Morton Codes and Hierarchical Bitsets for Broadphase The current grid broadphase relies on looping over AABBs and merging candidate arrays. We can revolutionize this spatial querying by mapping the 2D world grid into a 1D array using Morton Codes (Z-order curves), which mathematically guarantees that objects physically close in the world sit next to each other in RAM. If we back this up with a Hierarchical Bitset (a tree of 32-bit integers where a single bit represents grid chunk occupancy), broadphase culling becomes virtually instantaneous. Finding wall candidates or overlapping neighbors bypasses standard looping entirely, dropping down to raw CPU bitwise operations (&, |, and Math.clz32) to skip massive empty spaces in true O(1) time.

## PATHFINDING

Refactor Voronoi Regions to Typed Arrays

Where:

VoronoiRegions.js
Win: The region nodes are represented as loose JS objects (RegionNode) with dynamic array properties (edges, cells). Converting this structure to a VoronoiRegionView backed by flat Int16Array buffers will drastically reduce object header overhead and memory footprint.
Allocation-Free MinHeap for Abstract Search

Where:

FlatAbstractGraphSearch.run
Win: The abstract graph search creates a standard MinHeap and pushes { id, f } objects onto it. Changing this to utilize the existing index-based IdxMinHeap (which runs on flat arrays without object allocations) makes abstract graph routing completely allocation-free.
Encapsulate Persisted CSR Graphs

Where:

HpaWorkerEntry.js
Win: The CSR graph node count, edge offsets, and targets are written manually into parallel buffers. Creating a PersistedCSRGraph class that manages buffer views, writes, and offsets will clean up the manual indexing logic in HpaRegionGraphManager.
Consolidate Corridor Points to Typed Arrays

Where:

CorridorGridPathfinder.js
Win: Found paths are constructed using arrays of individual { c, r } objects. Passing these paths between functions as flat Int16Array coordinates ([c0, r0, c1, r1, ...]) will reduce heap allocations during layout validation.
Standardize CellIndexLayout coordinate conversions

Where:

GridUtils.js
Win: Coordinate mappings like layoutAbsToLocalCell are repeated in various formats across corridor, rail maze, and HPA systems. Promoting CellIndexLayout as the unified coordinate grid layout wrapper will enforce DRY rules across all localized subgrids.
SearchState Recycling & Pooling

Where:

SearchState.js
Win: When resizing grids or allocating worker state, new Float32Array buffers are created. Transitioning to a pooled/reusable SearchState model allows reusing backing arrays via Subarray slices instead of re-allocating.
Clean up duplicate isBlocked checks

Where:

CorridorGridPathfinder.isBlocked
Win: The bounds containment checks, room-blocked queries, and reserved indices lookups are repeated across isBlocked and isBlockedGlobal. Unifying these under the FlatGridView boundary makes boundary query logic DRY.
Extract passage-edge serialization

Where:

HpaPathWorker.\_packNavEdgePoolForWorker
Win: Packing edge pools for shared array buffer synchronization is done via direct array writes. Encapsulating this behavior into NavEdgePoolSerializer will isolate the edge memory layouts.
Centralize Flow Neighbor Grid updates

Where:

flowFieldWindow.js
Win: The neighbor grid generation uses a hardcoded 8 index multiplication mapping in rebuildFlowNeighborGrid. Introducing a neighbor layout definition class allows defining traversal offsets (8-way vs 4-way) in one place.

##

PR 1 — Pathfinding cleanup (DRY and low-risk allocation fixes)
This pass stays entirely within existing APIs and removes repeated logic before any buffer-layout migrations land. Start with CorridorGridPathfinder: fold isBlocked and isBlockedGlobal into a single boundary query routed through FlatGridView.contains plus one layoutIndex / roomBlocked / reservedIndices path, so callers that pass local vs absolute coordinates only differ at the entry shim. In the same PR, swap FlatAbstractGraphSearch.run from MinHeap + { id, f } pushes to the existing IdxMinHeap pattern already used by FlatGridSearch — a straight behavioral parity change with a targeted AStar.test.js addition asserting abstract routing still matches. Round it out by standardizing CellIndexLayout: audit corridor, rail-maze, and procedural maze code for hand-rolled (col - originCol) math and replace it with createCellIndexLayout, layoutAbsToLocalCell, layoutCellIndex, and layoutContainsAbsCell from GridUtils.js, deleting any duplicate local-index helpers that crept in alongside the layout typedef. No new classes yet; the goal is a smaller, consistent surface area that PRs 2–4 can build on without fighting two coordinate dialects.

PR 2 — Typed region graph and persisted CSR (first feature pass)
With coordinates unified, the first structural pass targets the HPA region graph memory model end to end. Replace loose RegionNode objects (edges, cells arrays, string ids) in VoronoiRegions.js with a VoronoiRegionView backed by flat Int16Array/Int32Array buffers: node metadata (col, row, sector), CSR-style cellOffsets/cellIndices for membership, and edgeOffsets/edgeTargets/edgeCosts for adjacency. Update hpaRegionGraph.js (floodFillRegion, mergeSmallRegions, repositionRegionCentroids, packRegionGraphFlat, damage rebuild) to read/write through the view rather than mutating node.cells.push. Introduce PersistedCSRGraph as the write/read façade over the worker SAB views currently hand-assembled in HpaRegionGraphManager.buildPersistGraphCsr and writeRegionGraphToSab — node count, edge offsets, targets, costs, and the prefix-sum CSR build become methods on one object bound to hpaPersist\*View slices. HpaRegionGraphManager should shrink to orchestration: bake regions → pack flat → persistedGraph.sync(nodeCount, edgeWrite) → expose a FlatGraphView for FlatAbstractGraphSearch. Tests: extend AStar.test.js for CSR round-trip, add a small Voronoi pack/unpack fixture if none exists.

PR 3 — Allocation-free hot paths (second feature pass)
The second feature pass attacks per-query heap churn on the paths that run most often during layout validation and replanning. In CorridorGridPathfinder, change findQuery/findPath to return flat Int16Array coordinates [c0, r0, c1, r1, …] (absolute cells in layout space) instead of { c, r }[]; thread that format through corridorFootprint.js, corridorWalkGrid.js, corridorLanePath.js, collectCorridorPathPolylines.js, and roomGraphCorridorBelts.js, adding thin decode helpers only where a polyline truly needs paired objects. Pair this with SearchState pooling: grow-once backing Float32Array/Int32Array slabs owned by HpaWorkerEntry and CorridorGridPathfinder, with resize() reusing via subarray(0, size) and prepare() incrementing runId as today — worker graph resize and corridor layout resize should stop allocating fresh search buffers on every bounds change. Optionally expose a FlatGridSearch path mode that writes into a caller-provided Int16Array ring to avoid the { col, row }[] reconstruction in reconstructGridPath for corridor-local searches. Verification stays targeted: corridorGridPathfinder consumers, AStar.test.js, and one rail-maze corridor path smoke test.

PR 4 — Worker serialization and flow-neighbor cleanup (final consolidation)
After region graphs and corridor paths speak typed arrays, the last pass isolates remaining manual buffer writes and hardcoded traversal constants. Extract HpaPathWorker.\_packNavEdgePoolForWorker into NavEdgePoolSerializer (colocated with navEdgePoolSab.js): owns byte-length sizing, packEdgePoolToSab, and the ref metadata HpaPathWorker needs for rebind detection, so the worker class only calls serializer.ensure(size) / serializer.pack(grid.edgeStore). In flowFieldWindow.js, replace the idx _ 8 / navIdx _ 8 duplication in rebuildFlowNeighborGrid with a NeighborGridLayout (or similar) that defines stride, direction count (8-way octile today, 4-way cardinal later), and the mapping from flow index → neighbor slot; FlowFieldWorkerEntry.syncFlowWindow binds layouts once per arena size. Use this PR to delete transitional shims from PRs 2–3: remove object-based corridor path exports if any remain, collapse duplicate SAB write loops in HpaBufferManager where PersistedCSRGraph and flat path writers now own their slices, and align writeCellPath with the Int16Array path format if PR 3 left a split between abstract index paths and cell coordinate paths. The bar for done: no pathfinding hot loop allocates per search, region graphs never materialize RegionNode instances on the worker, and flow/HPA edge packing each have a single serializer entry point.
