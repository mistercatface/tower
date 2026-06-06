/**
 * Libraries/Spatial — reusable spatial infrastructure (grids, geometry, collision, indexes, queries).
 * Game presets and hooks live in Systems/.
 */
// Grid
export { worldToGridAtOrigin, gridToWorldAtOrigin, worldToGridCentered, gridToWorldCentered, getCellBoundsCentered, entityIntersectsCellBounds, cellBoundsToWorldBounds } from "./grid/GridCoords.js";
export { colRowToIndex, indexToColRow, OCTILE_OFFSETS, CARDINAL_OFFSETS, octileDistance, forEachCardinalNeighbor } from "./grid/GridUtils.js";
export { chunkToWorldOrigin, getChunkSizePx, gridBoundsToChunkRange, worldBoundsToChunkRange } from "./grid/ChunkGrid.js";
export { getWallCellBounds, markWallOnGrid, clearWallCells, computeBoundsFromWalls } from "./grid/wallGridBake.js";
export { collectSegmentsInCellRect, collectSegmentsNearPose, collectSegmentsAlongLine, collectSegmentsInWorldBounds, segmentGridLayoutFromObstacleGrid } from "./grid/segmentGridWalk.js";
export { WorldObstacleGrid } from "./grid/WorldObstacleGrid.js";
// Geometry
export {
    getWallReach,
    closestPointOnSegment,
    distanceToSegment,
    distanceSqToSegment,
    circleIntersectsSegment,
    getCircleSegmentPenetration,
    isStrictlyInsideSegmentBox,
    toSegmentLocal,
    pushPointFromWalls,
    findClosestPointOnPathToWall,
    minDistanceSegmentToWall,
} from "./geometry/WallGeometry.js";
export { circleLeadingPoint, circleWallContactPoint, circlePairContactPoint, circlePairStruckUnitDirection } from "./geometry/circleContact.js";
export { rayExpandedLocalAabbHit, sweepCircleAgainstSegment, sweepCircleAgainstSegments } from "./geometry/circleSweep.js";
export { projectOntoPath, projectOntoPathFrom } from "./geometry/PathGeometry.js";
// Collision
export { CircleShape, PolygonShape } from "./collision/Shapes.js";
export { SatCollision } from "./collision/SatCollision.js";
export { broadphaseBoundsFromShape, pairBroadphaseBoundsOverlap } from "./collision/Broadphase.js";
export { applyPositionCorrection, separateAlongNormal, computeCircleWallContact, computePolygonWallContact } from "./collision/penetration.js";
export { resolveCirclePair } from "./collision/circlePair.js";
export { circlesOverlap, findFirstCircleSegmentHit } from "./collision/overlap.js";
export { resolveSatPair } from "./collision/satPair.js";
export { runCollisionPipeline } from "./collision/collisionPipeline.js";
export { ensureWallSegmentPolygonShape, resolveBodyAgainstWallSegments } from "./collision/wallResolution.js";
export {
    MOVING_SPEED_SQ,
    ROTATING_ANGULAR_SQ,
    NEIGHBOR_QUERY_PAD,
    entityBroadphaseExtent,
    isMovingEntity,
    isRotatingEntity,
    isKinematicallyActive,
    getBroadphaseBounds,
    pairBroadphaseOverlap,
    pairShapeOverlap,
    isPairActive,
    shouldResolvePushablePair,
    shouldResolveActorPushable,
} from "./collision/entityBroadphase.js";
// Indexes
export { EntityGrid } from "./indexes/EntityGrid.js";
export { WallSpatialIndex } from "./indexes/WallSpatialIndex.js";
// Query
export { SpatialQuery } from "./query/SpatialQuery.js";
export { entityWorldAabb, collectWallSegmentsForEntity, collectWallSegmentsAlongLine, collectObstacleGridSegmentsNearPose } from "./query/wallSegmentQuery.js";
export { wallContextFromState, getNearbyWalls, getWallsAlongLine } from "./query/wallContext.js";
export { hasLineOfSight } from "./query/lineOfSight.js";
export { castCircleRay, rayCircleHitDistance } from "./query/circleCast.js";
export { computeBodyContactPreview } from "./query/contactPreview.js";
// World frame
export { SpatialFrameCore } from "./world/SpatialFrameCore.js";
// Iso / structure
export { CAMERA_HEIGHT, projectVertical, resolveElevationAlpha, projectWorldPointAtHeight, projectWorldRectCorners } from "./iso/IsometricProjection.js";
export {
    rotateLocalX,
    transformLongAxisVertex,
    buildLongAxisBoxCorners,
    buildLongAxisBoxMesh,
    buildLongAxisFootprintObb,
    longAxisBoxDimsFromProp,
    fallenLongAxisDimsFromStrategy,
    convertStandTipToFallenLog,
    isStandTipProp,
    isStandTipTilted,
    isStandTipFallen,
    standTipStageRadius,
} from "./transforms/longAxisBox3d.js";
export { SharedEdgeSolver } from "./structure/SharedEdgeSolver.js";
