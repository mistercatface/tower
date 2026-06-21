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

Part 1 — HPA Region Graph Ownership Cleanup: Start with Libraries/Pathfinding/hpaRegionGraph.js and Libraries/Pathfinding/VoronoiRegions.js. The current code still passes around nodesMap, cellToNode, RegionNode, node.cells, and node.edges everywhere, with helpers like removeRegionNode, connectRegionEdge, reconnectRegionEdges, stripBlockedCellsFromRegions, and packRegionGraphFlat directly mutating the storage. This PR should introduce an object-backed HpaRegionGraph wrapper around the existing RegionNode model only: methods for create/remove region, assign/unassign cell, merge region, iterate cells, clear/connect edges, validate edges, and expose nodesMap only where legacy callers still need it. No typed arrays, no CSR rewrite yet. The target is to make buildFullRegionGraph and rebuildDamagedRegionGraph read like algorithms operating on a graph object instead of a pile of maps and arrays.

Part 2 — Persisted HPA CSR Boundary: Move the persisted graph write logic out of HpaRegionGraphManager in Libraries/Workers/Navigation/HpaWorkerEntry.js. Right now buildPersistGraphCsr, syncPersistAbstractGraph, and writeRegionGraphToSab make the manager responsible for packing nodes, copying hpaPersist\* SAB views, writing cellToRegion, and building edge offsets. Create a small PersistedHpaGraph or HpaPersistedGraphWriter near hpaWorkerSab.js that binds the SAB pools once and owns writePackedRegionGraph(packed, frame), CSR offset building, bounds checks, and FlatGraphView-ready views. Then HpaRegionGraphManager becomes orchestration: build/patch object region graph, call packRegionGraphFlat, pass packed data to the persisted writer, store persistNodeIds.

Part 3 — Flow Neighbor Layout Extraction: Clean up Libraries/Pathfinding/flowFieldWindow.js, Libraries/Workers/Navigation/FlowFieldWorkerEntry.js, Libraries/Pathfinding/gridReachabilityBfs.js, and Libraries/Pathfinding/FlowFieldGrid.js around the hardcoded 8-way neighbor grid. navTopologySab.js already has OCTILE_DIRS_PER_CELL, octileNeighborBase, and octileNeighborOffset, but flow still uses idx _ 8, navIdx _ 8, and size _ 8 _ 4. Add a tiny shared layout helper for octile neighbor grids or reuse/export the existing topology helpers cleanly, then route flow neighbor rebuild, reachability BFS, and SAB sizing through it. This is behavior-preserving, but it removes the magic stride before you later support different traversal modes or serializers.

Part 4 — Remaining Layout Stragglers And Tests: Do a final narrow audit of corridor/rail/room code, but keep it scoped because most of it already uses layoutAbsCellIndex. The actual straggler I saw is Libraries/RoomGraph/roomGraphCorridorRails.js, which still builds a layout object by hand and does cells[ci].c - bounds.originCol / cells[ci].r - bounds.originRow; convert that to createCellIndexLayout, layoutAbsToLocalCell, and layoutAbsCellIndex. Then add parity tests around the touched behavior: existing AStar.test.js already covers abstract CSR routing, so focus new coverage on HPA packed graph write/round-trip, flow neighbor grid equivalence, and corridor rail mask output equivalence. This PR series should leave the code with one region-graph mutation owner, one persisted HPA graph writer, one octile neighbor layout story, and no broad path format or typed-region migration yet.
