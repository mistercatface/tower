##

First, orchestrating the perception and locomotion tick can be centralized. Currently, both SnakeInstance (via createSnakeAutosim) and FleeAgentInstance manually handle the boilerplate for managing perception frames (ensureSnakePerceptionTick, maybeBeginSnakeAutosimTick, endSnakePerceptionFrame), syncing their spatial memory, and ticking their locomotion actuators. This repetition means any new species introduced in the future would have to copy-paste this exact control-flow sequence. An easy win is to introduce a unified tickAgentBrainAndLocomotion(state, instance, dtMs) helper in the population registry. This helper would encapsulate the entire perception-frame lifecycle, spatial memory sync, and locomotion ticking, leaving the individual agent instances to focus purely on their unique FSM state transition logic.

Second, chain assembly and physical spawning can be unified into a single factory. Right now, spawnSnakeChain (in snakeScene.js) and spawnFleeAgent (in spawnFleeAgent.js) independently invoke spawnPlacedSandboxProp, scale radii, establish kinetic distance constraints, set chain heads, and register spawn group metadata. We can consolidate this into a generic spawnAgentChain(state, anchorCell, spec) utility. This factory would accept a declarative specification—defining the head prop type, body segment prop types, segment count, faction, and scaling parameters—and handle all the physical joint linking and metadata registration under the hood. This would drastically simplify scene setup and make spawning any multi-segment agent a single-line declaration.

Third, the agent death and segment shattering sequence can be fully standardized. While we generalized predator-prey combat in snakeCombat.js, the actual destruction sequence remains split: FleeAgentInstance defines a custom die method that clears chain links and shatters segments, while SnakeInstance implements a more complex die method that also retires segments from navigation and cleans up active steering leases. We can consolidate this by moving the core destruction sequence into a generic reapAgentInstance(state, snakeGame, instance, deathImpact) function. This function would automatically resolve the agent's connected members, retire them from navigation, clear their physical constraints, shatter them into shards, and mark the head as dead in the registry. Individual species would then only need to provide optional lifecycle hooks (like onBeforeDie or onDeath) for any custom cleanup, making the combat resolution completely clean and uniform.

##

## Plan: plain balls → satellite horn agent

### Part 1 — Tear down integrated turret (balls are balls again)

Delete `Libraries/Game/snake/fleeAgent/fleeBallTurret.js` and `Libraries/Render/createFleeBallDraw.js` entirely. Remove every import and call: `syncFleeBallTurretFacing` from `kineticRollActuator.js` and `FleeAgentInstance.js`; `FLEE_BALL_TURRET_FACING_STEPS` / `turretFacingSteps` from `snakeGameConfig.js` and `Config/games/snake.js`. Revert `Assets/props/flee_ball/flee_ball.asset.js` to a plain rolling sphere like `ball.asset.js` (`primitive: "sphere"`, `NEUTRAL_SPHERE_VISUALS`, no custom `draw`, no `getCustomSpriteCacheKey`, no custom `quantizeSteps`). Strip `turretFacing` assignment from `spawnFleeAgent.js`. Delete `Libraries/Game/snake/fleeAgent/syncFleeAgentWedgeFacing.js` if it’s still in the tree. Grep the repo for `turretFacing`, `fleeBallTurret`, `createFleeBallDraw`, `getFleeBallSpriteCacheKey`, `buildFleeBallWedgeLocalVerts` and leave zero hits. Rewrite tests: drop turret cases from `fleeAgentSpawn.test.js`, delete or replace `fleeBallAsset.test.js` with “flee_ball is a normal kinetic sphere” smoke only.

### Part 2 — Horn prop (separate wedge entity, weapon-ready)

Use or refine `flee_wedge` (or new id e.g. `flee_horn`) as a standalone kinetic prop: polygon footprint, neutral coat, `canChain: true`, `rolls: true` or false per tuning, no combined draw with a ball. Collision comes from the asset’s polygon primitive / `localFootprint` — no `collisionParts` hack on the ball. Editor palette keeps horn placeable; it is not spawned as part of flee_ball. Optional: `syncCollisionShape` only if horn angle must drive hitbox later (flipper pattern); for v1, `facing` + polygon rotation is enough.

### Part 3 — Satellite agent species

Add a new snake-game species (e.g. `horn_satellite` / `ball_turret`) alongside `flee_agent` and `snake` in `species/index.js`: `createInstance`, `register`, `start`, `tick`, `die`, `validate`, `syncMembers`, `resolveRelationship`. Instance owns the **horn prop id** as `headId` (horn is the agent’s kinetic body). State: `mountBallId`, lifecycle `seeking | bound | dead`. No flee logic here — only find ball, attach, orbit, aim. Flee agent stays one species on the ball; two instances, one spawn group.

### Part 4 — Paired spawn and chain link

Extend flee pack spawn (or parallel spawn in `spawnFleeAgentsInScene`) to spawn ball + horn at rim, `addChainLink(ball, horn, linkSlack)` with rest length ≈ ball radius + horn mount gap, shared `spawnGroupId`, ball remains chain head / flee `headId`. Register flee instance on ball, satellite instance on horn. On ball death: satellite `validate` sees dead mount → detach link and die or return to `seeking`. On horn death: flee ball keeps fleeing; optional respawn horn later.

### Part 5 — Acquire + bind behavior

Satellite brain/perception: find nearest eligible ball (`flee_ball`, same spawn group, or tag/faction filter) within range. `seeking` → steer toward ball or roll into contact; on close enough, ensure distance link exists, set `mountBallId`, transition to `bound`. Re-bind if link broken. No ground-nav HPA required for v1 unless orbit needs it; direct roll toward ball center or rim point is fine.

### Part 6 — Orbit behavior (position on the ball)

While `bound`, satellite steers the **horn prop** (not the ball): e.g. maintain orbit angle θ on ring radius R around ball center, advance θ each tick for orbit speed, `steerRollToward` horn toward tangential rim target `ball + R·(cos θ, sin θ)` or apply tangential thrust with the distance link providing centripetal hold. Tune link slack, horn mass, friction so belts and ball acceleration drag the horn without exploding the constraint. Orbit policy lives entirely in satellite intent — nothing on the ball.

### Part 7 — Aim along ball movement (horn `facing`)

While `bound`, each tick read mount ball’s `vx`/`vy` (post-physics values — satellite tick after sim or read live during tick with awareness of ordering). Slew horn `facing` toward `atan2(vy, vx)` when speed &gt; epsilon, else hold last bearing or toward ball thrust if you inject flee nav context later. Use `steerRollToward` on horn for roll coupling or direct `facing` + `blendAngle` if horn doesn’t roll. Horn draw and SAT polygon both use horn `facing` — no separate turret field. Belt case is free: horn tracks ball velocity after `tickFloorOccupancy` without any ball-side sync.

### Part 8 — Combat: horn stabs snakes

Extend `resolveSnakeCombatFromContacts` (or satellite-specific hook from contacts): when horn body (satellite instance member) hits snake segment at `relSpeed >= splitImpulseThreshold`, treat flee satellite as aggressor — `splitSnakeAtStruckSegment` or equivalent — inverse of today’s “snake head kills flee ball prey.” Keep existing rule: snake head vs flee **ball** can still kill flee if you want prey behavior on the hull. Strike identity is horn `body.id`, not ball circle. Adjust `fleeAgentSpecies` / satellite `resolveRelationship` so snake is target, not only threat to flee.

### Part 9 — Tests and config

Config: `fleeAgent.bodyPropId` stays `flee_ball`; add `fleeHorn` / `hornSatellite` block (prop id, orbit radius, orbit speed, link slack, aim slew, acquire range). Tests: spawn pair + link; satellite binds to ball; after physics + ticks, horn `facing` tracks injected ball velocity; horn-vs-snake contact triggers split (harness like existing snake combat tests). Targeted runs: `fleeAgentSpawn.test.js`, new `hornSatellite.test.js`, no `fleeBallAsset` wedge cache tests.

### Part 10 — Cleanup and docs debt

Remove or archive stale `Plans/wedgeplan.md` integrated-turret content so it doesn’t contradict satellite design. Confirm editor/sandbox: placing lone `flee_ball` is valid; horn can wire to any chain-capable ball via chain link tool. No `turretFacing` in snapshots, persistence, or inspector. Optional later: multiple horns per ball (multiple satellites / links), fixed horn (`addAngleConstraint` ball↔horn), aim at threat instead of velocity — all satellite behavior changes, ball asset untouched.

---

**Sequence:** Part 1 first (hard reset to plain balls), then Parts 2–4 (horn entity + spawn), then 5–7 (behavior), then 8 (combat), then 9–10. Don’t add satellite behavior until Part 1 grep is clean and flee tests pass on a dumb sphere.
