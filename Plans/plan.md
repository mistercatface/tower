## VARIOUS

4. Leverage Shared Atomics in SabSlotWorkerHost
   The Advanced Feature: The worker infrastructure relies on SharedArrayBuffer pools to share nav topology, predecessor grids, and path pools without message-passing copies.
   The Underutilized Area: The slot state-management handshake in

SabSlotWorkerHost.js
still sends job completion notifications via standard main-thread worker postMessage loops.
The Easy Win: Use Atomics.wait and Atomics.notify (or lock-free polling of the shared buffers) on slotReadyId and slotRequestId inside SabSlotWorkerHost. This completely eliminates main-thread event loop message-handling overhead for pathfinding updates, lowering latency for multi-agent updates.

1. Incremental Eviction in FlowCacheManager using LruMap
   The Advanced Feature: A fully featured

LruMap
class is used for sprite caching and AI memory.
The Underutilized Area:

FlowCacheManager
handles cache eviction by calling this.invalidate(protocol) which completely wipes the lookup array and resets the slot counter to 0 whenever it exceeds maxCacheSize.
The Easy Win: Rewire FlowCacheManager to use the LruMap pattern to evict only the oldest unused flow field slot. Complete cache invalidation causes sudden CPU spikes and frame drops because all active agents using different flow fields are forced to re-request worker path recalculations at the same time.

##

Main Thread (Collision & Physics)

1. Optimize toSegmentLocal (WallGeometry.js) (6.2%) This function does megamorphic property checks (segment.width !== undefined ? segment.width : segment.size) and allocates a new object { localX, localY, halfX, halfY } every time it's called.

The Win: Standardize your segment object shapes so the JIT can optimize the property lookups (e.g., ensure they always have width and height, or use a class). Pass an out object to toSegmentLocal to eliminate the heavy GC churn from allocating millions of return objects per frame. 2. Direct Segment-AABB Math in minDistanceSegmentToAabb (Segment2D.js) (2.4%) Currently, minDistanceSegmentToAabb invokes distanceSegmentToSegment four separate times (once for each edge of the AABB), plus two distanceToAabb checks.

The Win: This is extremely expensive. Replace it with a single, direct Segment-to-AABB distance algorithm (which clamps the segment to the Voronoi regions of the box), bypassing the generic and heavy segment-segment math completely. 3. Bypass typeof checks in EntityRegistry.get (2.2%) get(refOrId) is called constantly and checks typeof refOrId === "object". In hot loops, this prevents the JIT from optimizing the method.

The Win: Split this into getById(id) and getByRef(ref), or enforce that callers only pass the integer/string ID, removing the type-checking branch entirely. 4. Batch invalidateBodyBroadphase outside the writeback loop (kineticBodySlab.js) (2.2%) writebackActiveKineticBodySlab iterates bodies to sync typed arrays back to objects, but calls invalidateBodyBroadphase(body) inside the loop, adding branch and property-mutation overhead (body.broadphaseSnapshot.x = NaN).

The Win: Inline the invalidation to avoid the function call overhead, or defer it to a dedicated pass. 5. Cache getShape on WorldProp (1.9%) If getShape creates new objects, arrays, or evaluates bounds every frame, it will thrash the GC and CPU.

The Win: Cache the evaluated shape locally on the prop whenever its defining bounds or type change, rather than dynamically regenerating or wrapping it during the collision pipeline. 6. Reduce DOM Thrashing (set textContent) (4.9%) Almost 5% of your main thread is spent updating DOM text nodes, likely a debug UI, entity count, or FPS counter overlay.

The Win: Rate-limit DOM updates to ~4-10Hz (e.g. only set textContent every 100ms) or move the debug stats into the Canvas ctx.fillText where it's drastically cheaper to redraw. 7. Tighten linkSegmentOverlapsWall AABB filtering (kineticConstraintSolver.js) (2.1%) The pre-filter reach = capsuleRadius + segment.size _ 0.75 uses a loose approximation that scales uniformly. If walls are long and thin, size _ 0.75 will pull in way too many candidates that are actually far away.

The Win: Project the wall's actual width/height for the bounds check, or use spatial hashing to reject far segments earlier, rather than feeding false positives into the expensive SatCollision narrow phase.
HPA Worker (Pathfinding) 8. O(1) Lookups for navCanStep (navTopologySab.js) (4-8% worker time) AStar.runGrid iterates its neighbors, generating nc, nr, and passes them to grid.canStep(curr, next). navCanStep then does a for (let i = 0; i < OCTILE_OFFSETS.length; i++) loop to figure out which direction index (dc, dr) it was passed.

The Win: This is O(N) inside your innermost A* loop! Build a 9-element flat lookup table: OCTILE_DIR_LOOKUP[(dc + 1) + (dr + 1) * 3] = i. You can instantly grab the direction index in O(1) time without looping. 9. Replace the Map in extraCostForIdx (navStepPenalty.js) (5.7% worker time) Your step penalty lookup uses a JavaScript Map keyed by a bit-packed cell ID (byKey.get(packCellKey(col, row))). Map lookups inside the A\* runGrid inner loop are performance killers.

The Win: If your grid size is fixed, replace the Map with a flat Uint8Array or Int32Array sized to cols \* rows. costArray[cellIdx] is orders of magnitude faster than Map.get(). 10. Pre-calculate the nearestNodeIdx loops (hpaReplanPrep.js) (5.5% worker time) nearestNodeIdx does a brute-force distance check against all abstract nodes: Math.hypot(col - nodeCol[i], row - nodeRow[i]). When expanding HPA boundaries, doing this dynamically is slow.

The Win: Either bake a chunk-to-region-node lookup grid when the abstract graph is generated, or use the cell's regionIdx directly to jump to the relevant abstract nodes instead of searching the entire graph.
