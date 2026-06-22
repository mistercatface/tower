##

First, orchestrating the perception and locomotion tick can be centralized. Currently, both SnakeInstance (via createSnakeAutosim) and FleeAgentInstance manually handle the boilerplate for managing perception frames (ensureSnakePerceptionTick, maybeBeginSnakeAutosimTick, endSnakePerceptionFrame), syncing their spatial memory, and ticking their locomotion actuators. This repetition means any new species introduced in the future would have to copy-paste this exact control-flow sequence. An easy win is to introduce a unified tickAgentBrainAndLocomotion(state, instance, dtMs) helper in the population registry. This helper would encapsulate the entire perception-frame lifecycle, spatial memory sync, and locomotion ticking, leaving the individual agent instances to focus purely on their unique FSM state transition logic.

Second, chain assembly and physical spawning can be unified into a single factory. Right now, spawnSnakeChain (in snakeScene.js) and spawnFleeAgent (in spawnFleeAgent.js) independently invoke spawnPlacedSandboxProp, scale radii, establish kinetic distance constraints, set chain heads, and register spawn group metadata. We can consolidate this into a generic spawnAgentChain(state, anchorCell, spec) utility. This factory would accept a declarative specification—defining the head prop type, body segment prop types, segment count, faction, and scaling parameters—and handle all the physical joint linking and metadata registration under the hood. This would drastically simplify scene setup and make spawning any multi-segment agent a single-line declaration.

Third, the agent death and segment shattering sequence can be fully standardized. While we generalized predator-prey combat in snakeCombat.js, the actual destruction sequence remains split: FleeAgentInstance defines a custom die method that clears chain links and shatters segments, while SnakeInstance implements a more complex die method that also retires segments from navigation and cleans up active steering leases. We can consolidate this by moving the core destruction sequence into a generic reapAgentInstance(state, snakeGame, instance, deathImpact) function. This function would automatically resolve the agent's connected members, retire them from navigation, clear their physical constraints, shatter them into shards, and mark the head as dead in the registry. Individual species would then only need to provide optional lifecycle hooks (like onBeforeDie or onDeath) for any custom cleanup, making the combat resolution completely clean and uniform.

##

Part 1 — Weld constraint in the physics core
Goal: One joint type in the solver that pins relative position + relative angle in 2D, using the same facing + anchor math chains already use. No flee-agent code involved yet.

Ship:

addWeldConstraint(session, { bodyA, bodyB, anchorA, anchorB, referenceAngle }) in kineticConstraints.js — either one registry entry or distance+angle treated as a single logical constraint with shared id for removal.
Slab gather/solve in kineticConstraintSolver.js: position at anchors (restLength = 0), angle lock (what you already prototyped).
Graph/island adjacency includes welds (same as distance/angle today).
collectKineticConstraintsSnapshot / applyKineticConstraintsFromSnapshot for weld entries.
Tests in tests/weldConstraint.test.js: two convex polys (or circle + poly), spawn offset wrong, run resolveGatheredKineticConstraintSlab, assert anchors coincide and relative angle holds across several ticks without any game sync.
Prove with: two generic sandbox props in a harness — not flee wedge. Flee types are irrelevant to this PR.

Moves the needle: physics.md Fundamentals weld checkbox, Tier 5 “Weld / fixed joint” → 🟡, Trilogy C2 started.

Part 2 — Authoring surface: spawn API, snapshot, debug draw
Goal: Welds are placeable, persistent, inspectable like chain links — not hardcoded in one spawn function.

Ship:

Spawn helper (e.g. addWeldLink in chainLinks.js or sibling weldLinks.js) that calls addWeldConstraint with resolved anchors from prop geometry.
Scene snapshot schema: weld entries alongside distance constraints (type "weld", body indices, anchors, referenceAngle).
Debug overlay in kineticConstraintOverlays.js — draw anchor points + weld icon (distinct from distance link).
Optional: chain/wire tool extension or inspector field on existing link tool (“fixed” vs “distance”) — even a minimal “weld these two props” in editor is enough for v1.
Prove with: load snapshot → weld survives save/load; overlay shows weld in sandbox.

Moves the needle: Tier 9 constraints snapshot ✅, Tier 5 chain topology / editor 🟡→✅, ROADMAP.md Constraints → “distance + weld”.

Part 3 — Flee agent as first consumer; delete the bolt-on
Goal: Flee spawn becomes declarative: ball head + flee_wedge welded in front at known angle. No syncPresentation pose override.

Ship:

spawnFleeAgent: replace angle constraint + post-physics sync with one weld:
anchorA on ball: forward offset (along spawn/grow axis in head local space).
anchorB on wedge: base center (local point opposite tip).
referenceAngle: tip points forward (your current -π/2 relationship).
Set head facing at spawn to forward axis (not random) so weld placement matches intent.
Steering convention (small, generic): when \_groundRollDrive is active on a roller, update facing from drive direction (integrateFacing stays false; roll stays visual). That gives “triangle rotates with ball” in 2D without flee-specific sync — same rule could apply to any steered roller with welded oriented children.
Remove / no-op FleeAgentInstance.syncWedgeFacing and fleeAgentSpecies.syncPresentation for wedge (or entire hook if nothing left).
Update fleeAgentSpawn.test.js: assert weld constraint in registry, wedge pose after physics ticks without calling sync.
Prove with: flee agent drives around in snake game; wedge stays glued ahead; combat still hits wedge body; no syncAgentsAfterPhysics wedge path.

Moves the needle: Tier 10 reference consumer (like chain links for distance), flee bolt-on removed, physics.md weld → ✅ ~70%.
