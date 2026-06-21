## PHYSICS

1. Implicit Free Lists for Branchless Sleep Management Checking if (slab.islandAsleep[i]) continue; thousands of times per frame inside hot loops destroys CPU pipeline efficiency through branch mispredictions. Instead of iterating over everything and skipping what is asleep, we can use an Implicit Free List (or array partitioning) to physically segregate memory. We maintain an activeConstraintCount pointer. When an island falls asleep, we execute a fast O(1) swap, moving its bodies and constraints to the end of the arrays and decrementing the active counter. The solver loops then simply become for (let i = 0; i < activeConstraintCount; i++). Sleeping objects mathematically cease to exist from the solver’s perspective—zero branching, zero iterations, and zero CPU cycles wasted on dormant physics.

2. Full Structure-of-Arrays (SoA) for Rigid Bodies While the kineticConstraintSlab beautifully applies Data-Oriented Design to constraints, it still resolves body velocities via object pointers (bodyA.vx, bodyB.vy). This forces the CPU to chase memory references across the heap, triggering L1 cache misses. The natural evolution is to flatten the entire active kinetic body pool into a unified Float32Array architecture (bodyVx, bodyVy, bodyInvMass). By resolving bodies entirely via integer indices inside the solver loop, we guarantee 100% linear memory access. Modern JavaScript JIT compilers (like V8) can aggressively unroll and vectorize these typed-array loops, easily yielding a 2x to 3x raw throughput multiplier for the core velocity solver.

3. Persistent Constraint Graphs & Manifold Caching Currently, the engine incurs a massive O(N) penalty every tick by completely tearing down and rebuilding the constraint slabs and wall candidate arrays. Physics engines fundamentally benefit from "temporal coherence"—objects mostly stay exactly where they were a millisecond ago. By upgrading to a Persistent Constraint Graph, the engine caches the topological network of contacts and joints. Instead of rebuilding arrays every frame, the system only patches the graph when a new collision begins, an old contact separates, or an island wakes up. This transforms the heaviest setup phases of the pipeline from a brute-force "recalculate everything" model into a lightweight "only update the delta" architecture.

4. Graph Coloring for Accelerated Solver Convergence Iterative constraint solvers process joints sequentially, meaning the array's order heavily biases the physical outcome (causing stretchy chains or uneven forces). By applying a greedy Graph Coloring algorithm to the constraint network during the gather phase, we can group constraints into independent "colors" where no two constraints share the same body. Solving all constraints of Color A, then Color B, mathematically guarantees zero memory contention between joints. This independence drastically accelerates solver convergence—meaning you get rock-solid, stiff physics in half the iterations. As a massive bonus, this colored independence perfectly sets up the physics engine to be multithreaded across Web Workers without race conditions.

5. Morton Codes and Hierarchical Bitsets for Broadphase The current grid broadphase relies on looping over AABBs and merging candidate arrays. We can revolutionize this spatial querying by mapping the 2D world grid into a 1D array using Morton Codes (Z-order curves), which mathematically guarantees that objects physically close in the world sit next to each other in RAM. If we back this up with a Hierarchical Bitset (a tree of 32-bit integers where a single bit represents grid chunk occupancy), broadphase culling becomes virtually instantaneous. Finding wall candidates or overlapping neighbors bypasses standard looping entirely, dropping down to raw CPU bitwise operations (&, |, and Math.clz32) to skip massive empty spaces in true O(1) time.

## PATHFINDING

Unify “cell bounds” handling around CellBounds. Pathfinding has several { startCol, endCol, startRow, endRow }-like flows, but some still pass startCol, endCol, startRow, endRow, cols, rows as loose scalars. navTopologySab.js is a clear candidate: buildOctileNeighborsFromTopologyRect() should probably take a CellBounds plus a grid/frame object.

Use GridFrame more aggressively. There is already GridNavSnapshot.js with { minX, minY, cellSize, cols, rows, key }. A lot of pathfinding functions still pass cols, rows, minX, minY, cellSize separately. Anything that needs indexing plus world/grid conversion probably wants frame.

Make GridPathQuery the standard start/target object. We added it for HPA, but AStar.js, corridor pathfinding, and tests still use scalar startCol, startRow, targetCol, targetRow. Converting call sites gradually would remove a lot of coordinate noise.

Introduce or extend a local grid layout object. GridUtils.js already has CellIndexLayout and patch layout helpers. Corridor code has its own { originCol, originRow, cols, rows } concept. Those should likely converge so corridor, rail maze, and patch-local searches use one layout API.

Replace repeated { col, row } allocations in hot loops with index-first APIs. Some object creation is clarity-friendly, but A\* path reconstruction and region graph scans create lots of small cell objects. A good split is: internal hot loops use dense indices/views, public/planner boundaries use GridPathQuery/cell objects.

Move flat A internals behind FlatGridSearch more fully.\* The wrapper exists now, but the old scalar functions still own most implementation. A later pass could make the flat functions thin compatibility exports and let the class own reconstruction, bounds checks, neighbor policy, and penalty lookup.

Create a FlatGraphView/CSR graph object. FlatAbstractGraphSearch still receives nodeCol, nodeRow, edgeOffsets, edgeTargets, edgeCosts, nodeCount. That is screaming for one object representing the CSR graph, especially since HpaAbstractGraph already almost is that object.

Consolidate region graph frame/bounds plumbing. hpaRegionGraph.js repeatedly destructures cols, rows, minX, minY, cellSize and passes blocked, frame, navGraph, cellToNode, nodesMap. A RegionGraphBuildContext could be a major clarity win.

Reuse CellRect iteration helpers everywhere bounds are rectangular. Some code already uses forEachDenseCellInRect, but others manually loop rows/cols. Standardizing that would reduce off-by-one risk and make “inclusive cell bounds” consistent.

Clean up corridor pathfinding separately. corridorGridPathfinder.js and corridorWalkGrid.js have visible unfinished/duplicated layout ideas, including a broken-looking createCorridorGridPathfinder(bounds) stub. That looks like an easy, isolated win after the HPA cleanup.

Create a shared GridFrame/GridWindow concept instead of parallel flow/HPA layouts. HPA already has GridFrame; flow fields have centerX, centerY, offsetX, offsetY, cellSize, cols, rows. If existing GridFrame is origin-based only, add a centered-window variant to GridCoords.js rather than letting flow fields keep their own layout language.

Give FlowFieldGrid the same protocol treatment as HpaPathWorker. It still wires \_workerHost.worker.onmessage, init payloads, bind messages, and window sync inline. A FlowFieldWorkerProtocol would mirror the HPA cleanup and reduce drift between the two worker styles.

Extract FlowFieldWindow as an object. Right now the flow window is scattered across centerX/centerY, offsets, flowToNavIdx, \_windowReady, \_windowSyncPromise, and rebuildFlowToNavMap(). A window object could own recentering, world/grid conversion, target containment, nav mapping, and topology keying.

Reuse GridCoords.js but extend it if needed. Flow sampling, FlowFieldGrid.worldToGrid(), gridToWorld(), getCellBounds(), and flowFieldWindow.rebuildFlowToNavIdx() all repeat centered-grid math. If current helpers are too scalar-heavy, add centered frame helpers that take a layout object.

Promote flow target requests to a FlowFieldRequest. ensureFlowRequest(targetX, targetY, range) repeats the same world-to-grid, bounds check, target index, cache slot, and worker payload logic. This is similar to HpaReplanRequest, just smaller.

Use CellBounds for topology bake rectangles. bakeNavTopology.js computes octCol0/octCol1/octRow0/octRow1 only to pass them into buildOctileNeighborsFromTopologyRect(). That function should probably take CellBounds, using existing CellRect helpers.

Add a grid index/view object where arrays and dimensions travel together. flowToNavIdx + navBlocked + neighborGrid + cols/rows/navCols/navRows recur across flow window and BFS. A small view class could own idx(cell), cell(idx), contains(cell), and avoid repeating width math.

Unify dense neighbor iteration. HPA uses forEachCardinalNeighbor / forEachDenseCellInRect; flow BFS manually decodes idx % gridWidth and walks neighborGrid. Some of that is performance-sensitive, but an object wrapper can keep hot loops flat while centralizing the index conventions.

Audit object allocation boundaries, not every object. Keep objects at API/planner boundaries (GridPathQuery, FlowFieldRequest, CellBounds), but use Into/scratch patterns for hot sampling and path loops. Flow sampling currently returns fresh { x, y }; if it is hot, add sampleFlowDirectionInto(out, ...).

Treat corridor/local patch grids as the same family. Corridor code has { originCol, originRow, cols, rows }, flow has centered local grids, HPA has origin frames. A shared “local cell layout” API in GridUtils.js would likely replace several almost-the-same coordinate transforms without inventing unrelated utilities.

##

Shared grid language pass. First PR should tighten the shared primitives without coupling HPA and flow fields directly: extend existing GridFrame, GridCoords, GridUtils, and CellRect APIs so callers can pass frame/layout/bounds objects instead of loose cols, rows, col, row, minX, minY, cellSize groups. This should cover origin-based nav frames, centered flow windows, local patch layouts, and dense cell iteration. The goal is one small shared vocabulary: frame/window, cell query, cell bounds, layout index.

HPA cleanup pass. Second PR should apply that shared vocabulary to the HPA stack: AStar, hpaRegionGraph, hpaPathRequest, hpaReplanPrep, hpaStitch, and navTopologySab. Convert rectangular bake/rebuild calls to CellBounds, use GridFrame where world/grid conversion is needed, wrap CSR graph arrays in a graph view, and reduce scalar coordinate threading in region graph and abstract search. This is mostly consolidation after the request/protocol/planner backbone we already added.

Flow-field parity pass. Third PR should give flow fields the same backbone treatment without forcing them into HPA classes. Extract a FlowFieldWindow for centered layout, recentering, world/grid conversion, target containment, nav mapping, and cache keys. Add a FlowFieldWorkerProtocol for init, bind, window sync, and slot ready handling. Add a FlowFieldRequest for target/range/cache-slot worker payloads. This makes flow fields maintainable on their own while reusing the shared grid primitives from pass 1.

Hot-path and corridor pass. Fourth PR should clean up remaining drift: convert corridor/local patch grids to the shared layout API, replace manual rect loops with CellRect helpers where appropriate, and add Into/scratch variants for hot object creation spots like flow sampling or repeated path reconstruction. Keep compatibility exports for old flat search calls until callers are migrated, but make the object-oriented APIs the primary path. This pass is where we remove leftovers and make the new structure feel complete rather than layered on top.

##

PR 1: Flow parity without over-abstracting. Clean up flow fields first because that is where the current duplication/inline state is most visible. Extract FlowFieldWindow as the owner of centered frame, recentering, containment, world/grid conversion, flow-to-nav mapping, topology keying, and reachability helpers. Add FlowFieldRequest for target/range/cache-slot payload construction. If worker boilerplate still feels duplicated after that, extract only a small composition helper around SabSlotWorkerHost for slot posting, ready messages, invalidation, error/shutdown binding, and init posting. Do not generalize graph patching or window sync into a shared superclass.

PR 2: HPA/search ownership pass. Keep HPA domain-specific, but make the object APIs own more of the work. FlatGridSearch should become the main path for grid search, with scalar A\* exports reduced to compatibility wrappers. Add a FlatGraphView/CSR object so abstract graph search receives one coherent graph instead of parallel arrays. Convert HPA patch/topology rebuild plumbing to pass CellBounds, GridFrame, GridPathQuery, and graph views directly where possible. This leaves HPA easier to debug because the big concepts are named objects, while hot loops can stay flat and index-based inside the search implementations.

PR 3: Layout/corridor consolidation and leftovers. Use the shared vocabulary at the remaining edges: corridor routing, rail-maze patch routing, local patch searches, and repeated rectangular loops. Converge { originCol, originRow, cols, rows } concepts into CellIndexLayout or a slightly extended layout API, use CellRect helpers for rectangular bounds where it improves clarity, and keep allocation-heavy { col, row } creation at public/planner boundaries rather than inside BFS/A\* internals. This is the cleanup pass that makes the system feel finished: flow, HPA, flat search, corridor, and patch-local code all speak the same frame/query/bounds/layout language without adding a heavyweight architecture.
