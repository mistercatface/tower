/**
 * Sandbox toy orchestration: input session, behavior plugins, equip UI.
 *
 * Weapon semantics (ammo, charge cadence, projectile spawn, gun state) live in
 * `Libraries/Combat/` (`worldPropManualFire`, `worldPropWeaponState`, `spawnProjectiles`).
 * Behaviors here only wire pointer input and tick hooks to those modules.
 */
export { bindCanvasPointers, releasePointerCapture } from "./bindCanvasPointers.js";
export { createSandboxSession } from "./sandboxSession.js";
export { createSandboxController } from "./createSandboxController.js";
export { createCueStrikeBehavior, CUE_STRIKE_BEHAVIOR_ID } from "./behaviors/cueStrikeBehavior.js";
export { createDragLaunchFacingBehavior, DRAG_LAUNCH_FACING_BEHAVIOR_ID } from "./behaviors/dragLaunchFacingBehavior.js";
export { createSpawnerBehavior, SPAWNER_BEHAVIOR_ID } from "./behaviors/spawnerBehavior.js";
export { isSpawnerProp, isSpawnerWorldProp, listSpawnerSpawnPropIds, resolveSpawnerPropId, fireSpawner } from "./spawnerConfig.js";
export { createRollToCursorDirectBehavior, ROLL_TO_CURSOR_DIRECT_BEHAVIOR_ID } from "./behaviors/rollToCursorDirectBehavior.js";
export { createRollToCursorHpaBehavior, ROLL_TO_CURSOR_HPA_BEHAVIOR_ID } from "./behaviors/rollToCursorHpaBehavior.js";
export { createShootBehavior, SHOOT_BEHAVIOR_ID } from "./behaviors/shootBehavior.js";
export {
    resolveSandboxPathVisual,
    setSandboxPathVisual,
    SANDBOX_PATH_VISUAL_OFF,
    SANDBOX_PATH_VISUAL_NORMAL,
    SANDBOX_PATH_VISUAL_DEBUG,
    SANDBOX_PATH_VISUAL_OPTIONS,
    SANDBOX_PATH_VISUAL_LABELS,
} from "./sandboxPathVisual.js";
export {
    resolveSandboxPropVisual,
    setSandboxPropVisual,
    SANDBOX_PROP_VISUAL_DEFAULT,
    SANDBOX_PROP_VISUAL_VECTOR,
    SANDBOX_PROP_VISUAL_OPTIONS,
    SANDBOX_PROP_VISUAL_LABELS,
} from "./sandboxPropVisual.js";
export { isSandboxCameraTarget, setSandboxCameraTarget, findSandboxCameraTargetWorldProp, tickSandboxCameraFollow } from "./sandboxCameraTarget.js";
export { renderSandboxEquipPanel } from "./sandboxEquipPanel.js";
export {
    getSandboxBehaviorLabel,
    isSandboxEquippable,
    isSandboxSpawnable,
    isSingleWorldPropSpawnAsset,
    isPoolRackSpawnAsset,
    resolveSandboxBehaviors,
    forEachArmedSandboxWorldProp,
    SANDBOX_BEHAVIOR_LABELS,
} from "./sandboxCapabilities.js";
export { evaluateInputGates, evaluateInputGateRule, isEntityAtRest, isEntityAsleep, resolveInputGateScope } from "./inputGates.js";
export { resolveWorldPropSandboxBehavior, resolveWorldPropInputGateRules } from "./sandboxBehaviorConfig.js";
export { spawnPoolRack } from "./spawnPoolRack.js";
export { SANDBOX_SCENE_SCHEMA_VERSION, applySandboxSceneSnapshot, collectSandboxSceneSnapshot, parseSandboxSceneSnapshot } from "./sandboxSceneSnapshot.js";
export {
    DEFAULT_NODE_GRAPH_GEN_CONFIG,
    DEFAULT_ROOM_GRAPH_GRID,
    buildSandboxRoomGraphSceneDoc,
    buildSandboxGraphSceneDoc,
    spawnSandboxGraphScene,
    DEFAULT_SANDBOX_GRAPH_SCENE_OPTIONS,
    DEFAULT_SANDBOX_GRAPH_MOTIFS,
    DEFAULT_SANDBOX_GRAPH_CELL_SIZE,
    resolveSandboxGraphSceneOptions,
    parseTreeEdgesSpec,
    childrenMapFromTreeEdges,
    placeGraphNodesTreeSpread,
    roomPropSpecToSceneProp,
    roomPropSpecsToSceneProps,
    buildBranchingNodeTree,
    buildBranchingRoomTree,
    buildDirectedGraphEdges,
    buildNodeGraph,
    buildRoomsFromNodeGraph,
    mergeRailWalls,
    placeGraphNodes,
    placeRooms,
    propsForRoomCenters,
    punchHoleInClosedRoom,
    punchHolesForDirectedEdges,
    punchHoleTowardNeighbor,
    punchOneHolePerRoom,
    railWallsForClosedRect,
    railWallsForClosedRoom,
    railWallsForClosedRooms,
    railWallsForRoomOutlines,
    resolveNodeGraphGenConfig,
    roomGraphLayoutToSceneDoc,
    roomWallEdgeKey,
    roomWallGapKeysWorld,
    omitRailWallsAtGapKeys,
    tryBuildCorridorRails,
    tryBuildCorridorForEdge,
    tryBuildCorridorRailsForEdges,
    tryBuildNodeGraph,
    tryBuildRoomGraphLayout,
    tryBuildSingleCorridorRails,
    tryLayoutRoomGraph,
    wireDirectedEdgeToRoomHoles,
    buildCorridorPathBetweenHoles,
    punchHolesOnDirectedEdge,
    punchHolesForNodeIncidentEdges,
    corridorPathIntersectsAny,
    validateLayoutPasses,
    describeLayoutValidationFailure,
    runRoomGraphMotifs,
} from "./sandboxRoomGraphGen.js";
export { buildSandboxStartSceneDoc, spawnSandboxStartScene } from "./sandboxStartScene.js";
export { evaluatePortalStepEntry } from "./portalLinks.js";
export { tryPortalIntake, applyPortalTraverse } from "./portalTraverse.js";
export { syncBoundaryNavIndex, buildBoundaryNavHops, expandBoundaryHopsInCellPath } from "./boundaryNavIndex.js";
export { addSandboxWalls, removeSandboxWalls, clearSandboxWallsInBounds } from "./sandboxWalls.js";
export {
    bakeAnimatedSurfaceFlipbook,
    releaseAnimatedSurfaceFlipbook,
    railBandBoundsAroundPlayfield,
    createAnimatedSurfaceZone,
    disposeAnimatedSurfaceZone,
    drawAnimatedSurfaceZone,
    drawAnimatedSurfaceZones,
    pushAnimatedSurfaceZone,
    removeAnimatedSurfaceZoneById,
    clearAnimatedSurfaceZones,
} from "../WorldSurface/animatedSurfaceZone.js";
export {
    DRAG_LAUNCH_DEFAULTS,
    applyDragLaunchVelocity,
    createDragLaunchAim,
    createDragLaunchBehavior,
    createDragLaunchWaitBehavior,
    createDragLaunchInteraction,
    drawDragLaunchPreview,
    getDragLaunchConfig,
    getDragLaunchPreview,
    resolveDragLaunchPullRatio,
    isSandboxProp,
    releaseDragLaunch,
    updateDragLaunchAim,
    DRAG_LAUNCH_BEHAVIOR_ID,
    DRAG_LAUNCH_WAIT_BEHAVIOR_ID,
} from "./dragLaunch.js";
