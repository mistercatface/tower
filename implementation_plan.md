# Further Consolidate Physics, Motion, and Spatial Query Files

To eliminate all small/single-function "sprawl" files, we will perform a deep consolidation pass:
1. Merge the recently moved `collisionDefaults.js` directly into `physicsDefaults.js`, eliminating a separate file for collision defaults.
2. Merge the single-function `rigidBodyImpulse.js` into `motionDynamics.js`.
3. Merge `collisionPipeline.js` into the main physics loop entry point `kineticPhysicsPass.js`, removing spatial-to-motion file coupling and deleting the standalone pipeline file.
4. Consolidate four small query modules (`circleCast.js`, `lineOfSight.js`, `wallSegmentQuery.js`, `steppedCircleRayCast.js`) into a single file `spatialQueries.js`, and delete the original files.

## User Review Required

> [!IMPORTANT]
> - `Libraries/Motion/collisionDefaults.js` will be merged into [Libraries/Motion/physicsDefaults.js](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Motion/physicsDefaults.js), deleting the standalone defaults file.
> - `Libraries/Motion/rigidBodyImpulse.js` will be merged into [Libraries/Motion/motionDynamics.js](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Motion/motionDynamics.js), deleting the standalone impulse file.
> - `Libraries/Spatial/collision/collisionPipeline.js` will be merged into [Libraries/Motion/kineticPhysicsPass.js](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Motion/kineticPhysicsPass.js), deleting the standalone pipeline file.
> - Four query files (`circleCast.js`, `lineOfSight.js`, `wallSegmentQuery.js`, `steppedCircleRayCast.js`) will be merged into a single new file: [Libraries/Spatial/query/spatialQueries.js](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Spatial/query/spatialQueries.js), deleting the original files.

## Open Questions

None.

## Proposed Changes

---

### [Physics & Collision Defaults]

Merge all configuration defaults and shared radius helpers into a single file.

#### [MODIFY] [physicsDefaults.js](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Motion/physicsDefaults.js)
- Append collision configuration settings (`LIBRARY_COLLISION_DEFAULTS`, `collisionSettings`).

#### [DELETE] [collisionDefaults.js](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Motion/collisionDefaults.js)
- Delete the file.

---

### [Motion Dynamics & Impulse]

Consolidate continuous dynamics and instant contact impulses.

#### [MODIFY] [motionDynamics.js](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Motion/motionDynamics.js)
- Append the `applyRigidBodyImpulse` function.
- Point local default restitution query to `./physicsDefaults.js`.

#### [DELETE] [rigidBodyImpulse.js](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Motion/rigidBodyImpulse.js)
- Delete the file.

---

### [Physics & Collision Pipeline]

Merge the sub-step solver loop directly into the physics pass coordinator.

#### [MODIFY] [kineticPhysicsPass.js](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Motion/kineticPhysicsPass.js)
- Inline `runCollisionPipeline` and `resolveActiveBodyWalls` from `collisionPipeline.js`.
- Remove the dependency/import of `collisionPipeline.js`.

#### [DELETE] [collisionPipeline.js](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Spatial/collision/collisionPipeline.js)
- Delete the file.

---

### [Spatial Queries Consolidation]

Consolidate single-function files in `Libraries/Spatial/query/` into a single query module.

#### [NEW] [spatialQueries.js](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Spatial/query/spatialQueries.js)
- Coalesce `rayCircleHitDistance`, `hasLineOfSight`, `resolveWallSegmentQueryRadius`, `collectWallSegmentsAlongLine`, and `castSteppedCircleRay` into this single module.
- Internal helpers (`circlesOverlap`, `findFirstCircleSegmentHit`, `collectCandidateWalls`, `rayCircleHitsWall`) will also live in this module.

#### [DELETE] [circleCast.js](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Spatial/query/circleCast.js)
- Delete the file.

#### [DELETE] [lineOfSight.js](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Spatial/query/lineOfSight.js)
- Delete the file.

#### [DELETE] [wallSegmentQuery.js](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Spatial/query/wallSegmentQuery.js)
- Delete the file.

#### [DELETE] [steppedCircleRayCast.js](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Spatial/query/steppedCircleRayCast.js)
- Delete the file.

---

### [Import Updates]

Update all imports currently pointing to the merged files to refer to their new unified homes.

#### [MODIFY] [entityBroadphase.js](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Spatial/collision/entityBroadphase.js)
- Point `collisionSettings` import to `../../Motion/physicsDefaults.js`.

#### [MODIFY] [kineticContactSolver.js](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Spatial/collision/kineticContactSolver.js)
- Point `collisionSettings` import to `../../Motion/physicsDefaults.js`.

#### [MODIFY] [kineticPairStream.js](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Spatial/collision/kineticPairStream.js)
- Point `collisionSettings` import to `../../Motion/physicsDefaults.js`.

#### [MODIFY] [kineticSleep.js](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Motion/kineticSleep.js)
- Point `collisionSettings` import to `./physicsDefaults.js`.

#### [MODIFY] [kineticConstraintSolver.js](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Motion/kineticConstraintSolver.js)
- Point `collisionSettings` import to `./physicsDefaults.js`.

#### [MODIFY] [bodyMass.js](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Motion/bodyMass.js)
- Point `collisionSettings` import to `./physicsDefaults.js`.

#### [MODIFY] [engineGlobals.js](file:///c:/Users/mrjbl/Desktop/tower/Core/engineGlobals.js)
- Point `collisionSettings`, `LIBRARY_COLLISION_DEFAULTS`, `physicsSettings`, and `LIBRARY_PHYSICS_DEFAULTS` to `./physicsDefaults.js`.

#### [MODIFY] [GameDefinitionTypes.js](file:///c:/Users/mrjbl/Desktop/tower/Core/GameDefinitionTypes.js)
- Point JSDoc type import path for `LibraryCollisionSettings` to `../Libraries/Motion/physicsDefaults.js`.

#### [MODIFY] [collisionSettingsHarness.js](file:///c:/Users/mrjbl/Desktop/tower/tests/harness/collisionSettingsHarness.js)
- Point `collisionSettings` and `LIBRARY_COLLISION_DEFAULTS` imports to `../../Libraries/Motion/physicsDefaults.js`.

#### [MODIFY] [collisionDefaults.test.js](file:///c:/Users/mrjbl/Desktop/tower/tests/collisionDefaults.test.js)
- Point imports to `../Libraries/Motion/physicsDefaults.js`.

#### [MODIFY] [activeKineticBodies.test.js](file:///c:/Users/mrjbl/Desktop/tower/tests/activeKineticBodies.test.js)
- Point imports to `../Libraries/Motion/physicsDefaults.js`.

#### [MODIFY] [kineticIslands.test.js](file:///c:/Users/mrjbl/Desktop/tower/tests/kineticIslands.test.js)
- Point imports to `../Libraries/Motion/physicsDefaults.js`.

#### [MODIFY] [kineticSleepProps.test.js](file:///c:/Users/mrjbl/Desktop/tower/tests/kineticSleepProps.test.js)
- Point imports to `../Libraries/Motion/physicsDefaults.js`.

#### [MODIFY] [cueStrikeCollision.js](file:///c:/Users/mrjbl/Desktop/tower/Libraries/CueStick/cueStrikeCollision.js)
- Point `applyRigidBodyImpulse` import to `../Motion/motionDynamics.js`.

#### [MODIFY] [engine.js](file:///c:/Users/mrjbl/Desktop/tower/Apps/Editor/engine.js)
- Point `runCollisionPipeline` to `../../Libraries/Motion/kineticPhysicsPass.js`.

#### [MODIFY] [glassFracture.test.js](file:///c:/Users/mrjbl/Desktop/tower/tests/glassFracture.test.js)
- Point `runCollisionPipeline` to `../Libraries/Motion/kineticPhysicsPass.js`.

#### [MODIFY] [kineticEarlyOut.test.js](file:///c:/Users/mrjbl/Desktop/tower/tests/kineticEarlyOut.test.js)
- Point `runCollisionPipeline` to `../Libraries/Motion/kineticPhysicsPass.js`.

#### [MODIFY] [kineticPairPersistence.test.js](file:///c:/Users/mrjbl/Desktop/tower/tests/kineticPairPersistence.test.js)
- Point `runCollisionPipeline` to `../Libraries/Motion/kineticPhysicsPass.js`.

#### [MODIFY] [kineticTopologyLifecycle.test.js](file:///c:/Users/mrjbl/Desktop/tower/tests/kineticTopologyLifecycle.test.js)
- Point `runCollisionPipeline` to `../Libraries/Motion/kineticPhysicsPass.js`.

#### [MODIFY] [wallResolution.test.js](file:///c:/Users/mrjbl/Desktop/tower/tests/wallResolution.test.js)
- Point `runCollisionPipeline` to `../Libraries/Motion/kineticPhysicsPass.js`.

#### [MODIFY] [circleAimLinePreview.js](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Spatial/query/circleAimLinePreview.js)
- Point `rayCircleHitDistance` and `castSteppedCircleRay` imports to `./spatialQueries.js`.

#### [MODIFY] [lineOfSight.test.js](file:///c:/Users/mrjbl/Desktop/tower/tests/lineOfSight.test.js)
- Point `hasLineOfSight` import to `../Libraries/Spatial/query/spatialQueries.js`.

## Verification Plan

### Automated Tests
- Run `node scripts/run-tests.mjs` to verify all 762 tests compile and pass.
