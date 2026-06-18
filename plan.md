PR 1 — Pre-game: ground nav structure
Rename and split the rollToCursor\* stack into actuator (kineticRollActuator — steer, accel, roll spin), planners (directGroundNav, flowGroundNav, hpaGroundNav + hpaGroundNavSession), and input (cursor + P-key mass move calling setMoveTarget, not living inside behaviors). Keep old behavior ID strings as aliases so stamped props and saves don’t break. Goal: code and reviews talk about “per-entity ground navigation,” not cursor debug, so later pathing work lands in the right modules.

PR 2 — HPA replan: obstacle epoch + idle recovery
Wire hpaGroundNavSession to the replan policy humanoids had but blue ball never got: detect navigation.obstacleGeneration changes and replan visible props (replace the dead \_navPathStale path); replan when pathLen === 0 or target cell changes (partially there already). Match flow mode’s epoch invalidation on HPA. No direct-steer fallback — if there’s no path yet, queue replan and hold steering until the worker returns. Goal: map edits and stale graphs stop sending balls into walls.

PR 3 — HPA replan: stuck + off-path
Port trackNavStuck, offPathReplanDue, and consumption of computeSabPathSteering’s offPath flag into hpaGroundNavSession.update, with the same thresholds already in navigationSettings (stuckMoveThreshold, stuckReplanFrames, pathOffPathDistance). Replan from current (x,y) when physics bumps a ball off the polyline or wedges it in a corner, still following HPA once the new path arrives. Goal: kinetic sim disturbances recover the way humanoid nav did, without a separate locomotion stack.

PR 4 — Visibility + mass-nav replan budget
Add viewport visibility gating via obstacleReplanAllowed / idlePathReplanAllowed: full replan policy for on-screen balls, deferred epoch/off-path replans off-screen unless stuck long enough. Prioritize replan requests against MAX_HPA_REPLAN_SLOTS (512) so P-key mass move and wall edits don’t thundering-herd the worker — visible + stuck first, catch-up on enter-view. Goal: the worker-based HPA system humanoids were built for actually scales to hundreds/thousands of individual targets, with visibility as budget policy not an optional nicety.
