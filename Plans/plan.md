PR 1 — Nav-walkable bitmask (ROADMAP §4.1)
Replace the string-key Set walkability cache with a dense per-cell flag (plus the existing cells[] list for random picks), keyed off obstacleGeneration and patchable via damageBounds the same way GridNavContext already does for navCardinalOpen. Every hot caller (navWalkable.has, isNavWalkableCellAt, belt filtering, spawn checks) becomes O(1) index lookup with no allocations; include rebake-on-epoch tests and a quick snake perf check so you have the deletion-friendly substrate everything else depends on.

PR 2 — Link capsule wall culling (physics proving ground)
Optimize projectIslandLinkCapsulesAgainstWalls / projectDistanceLinkCapsuleAgainstWalls with link-AABB filtering against the frame’s wall-candidate buckets, reuse/clear the per-island walls[] buffer, and skip work for asleep or nearly-static links. This is pure snake-chain physics perf (~17% of your profile) and doesn’t change gameplay — just keeps 70-snake sim headroom before you add wall impacts.

PR 3 — Trilogy C1: manifolds + substep early-out
Finish the partial contact stack: feature-id keyed manifold warm-start, reduced re-solving on resting contacts, and substep early-out when impulses are negligible. Helps all kinetic piles (snake segments, striker, debris) and is independent of walls — land it before striker starts adding new contact traffic.

PR 4 — Wall health + striker breakage + localized nav delete
Add health on voxel fill and rail-wall edges (max HP per stamp type, damage on striker impact above speed threshold), clear geometry at 0 HP through existing grid/boundary APIs, and call onObstaclesChanged(damageBounds) so HPA region patch + PR 1’s walkable bitmask update only the broken region. Striker keeps snake-split behavior; this PR adds wall damage/deletion as the gameplay hook that stress-tests incremental nav.

PR 5 — Damage overlay (render)
Wire the health store into wall draw: face + cap/roof tint from 1 - health/maxHealth (white → red), using the ProjectedWallDraw hook that’s already documented for “optional damage overlay.” Invalidate baked wall sprites when health changes in a cell bounds rect so you’re not redrawing the whole map each frame.

PR 6 — Ground nav arrival fix + snake-mode path debug
Fix HPA and flow ground-nav so right-click “move here” actually releases the target at arrival (cell-centered stop, belt-aware release, no endless replan/locomotion) — likely shared with cellTargetHpaNav arrival rules. In snake mode, draw path overlays for any prop under manual HPA/flow nav (reuse appendPathOverlayCommands / behavior getPathOverlay, not only the FSM debug flag) so you can right-click a test ball through a maze, punch holes with the striker, and visually confirm routes update after PR 4.
