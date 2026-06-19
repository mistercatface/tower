PR 1 — Extract KineticSession (stop storing physics topology on sandbox)

Goal: make the kinetic slice a real object with a real name, not state.sandbox with a grab bag of unrelated fields.

Create state.kinetic (new KineticSession class in GameState/ or Libraries/Motion/). Move off SandboxWorldState: kineticConstraints, kineticConstraintsDirty, kineticConstraintsVersion, kineticTopologyGeneration, \_kineticIslandPlan, \_kineticConstraintGraphCache, kineticSolverStats. Rename APIs in kineticConstraints.js, kineticTopology.js, kineticIslands.js, kineticConstraintGraph.js from sandbox → session. Update call sites that only touch constraints/topology: chainLinks.js, kineticConstraintOverlays.js, sandboxSceneSnapshot.js, EntityRegistry (prune/clear), KineticSpatialFrame (topology bump on admit/evict), kineticPhysicsPass.js, collisionPipeline.js, kineticContactSolver.js (gather stamp). Tests: replace inline { kineticConstraints: [], kineticTopologyGeneration: 0 } sandbox mocks with new KineticSession() or { kinetic: new KineticSession() }.

Exit criteria: zero kinetic fields left on SandboxWorldState; grep for state.sandbox.kinetic / addDistanceConstraint(state.sandbox is gone; all constraint/island/topology modules take session only. SandboxWorldState keeps editor/game stuff (controller, belts, zones, snakeGame, entityMeta). No tick object yet — just one honest slice.

PR 2 — Introduce WorldSim at lifecycle seams (registry + props + session, not state)

Goal: the remaining state threading in physics is almost entirely “I need registry live lookup” or “I mutate world membership.” Split that out.

Define a small WorldSim shape (plain object or class): { worldProps, entityRegistry, kinetic }. Refactor lifecycle/mutation APIs to take world + frame instead of state: removeWorldPropFromState(world, prop, frame), tryFractureKineticContact(world, frame, …), prop.spawnGlassShatter(world, …), gatherKineticConstraintBuffer(session, registry, frame), measureDistanceConstraintError(registry, constraint). Pipeline entry (runCollisionPipeline, runKineticPhysics) peels state once at the top: const world = { worldProps: state.worldProps, entityRegistry: state.entityRegistry, kinetic: state.kinetic } and passes slices down. Side effects hook becomes applyKineticContactSideEffects(world, frame, contacts, { snakeGame }) — fracture/spawn use world; snake combat still gets game flags from state.sandbox at the pipeline boundary only (one place, not buried in solver).

Exit criteria: grep state inside Libraries/Motion/ and Libraries/Spatial/collision/ hits only orchestrator entry points (runKineticPhysics, runCollisionPipeline, side-effects hook wiring) — not constraint gather, not fracture, not pair validation. Tests that exercise physics build { world, frame } directly instead of fake full state. After this, Step 2’s KineticTick = { frame, session, world } is a one-line bundle at begin(), not a rename of existing mess.

/////////////

Step 2 — introduce KineticTick only at the orchestration seam, not as a wrapper. Once the slices are real, build the tick once per substep in runKineticPhysics / runCollisionPipeline: { frame, session, world } (or { frame, sandbox, registry } if you don't want a new type yet). The pipeline takes one argument; inner physics takes frame; gather/island/constraint code takes session; fracture/registry/removal takes world + frame. Tests stop building fake { sandbox: { kineticConstraints: [] } } state bags and instead construct { session: new SandboxWorldState(), registry: …, frame } — which reads like what the test is actually exercising. That's the readability win: call sites say which part of the sim they touch, not "here's the god object, dig for sandbox."
