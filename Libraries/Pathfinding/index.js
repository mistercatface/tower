/**
 * Libraries/Pathfinding — pure navigation math (A*, HPA regions, flow fields, path follow).
 * Pose input uses AgentPose from Libraries/Agent; output is SteeringResult.
 */
export { runLocalAStarFlat, runAbstractAStar } from "./AStar.js";
export { computeFlowField } from "./flowFieldBfs.js";
export { FlowFieldGrid } from "./FlowFieldGrid.js";
export { gridReachabilityBfs } from "./gridReachabilityBfs.js";
export { sampleFlowDirection, sampleFlowDirectionOnGrid } from "./sampleFlowDirection.js";
export { createNavState } from "./navSession.js";
export { computeFlowSteering } from "./flowSteering.js";
export { computeFlowFieldSteering } from "./flowSteering.js";
export { computeHpaSteering } from "./hpaSteering.js";
export {
    trimPathAhead,
    isWallCornerWaypoint,
    computePathSteering,
} from "./pathFollow.js";
export {
    prepareNavigationPath,
    orthogonalizePath,
    placeAtWallClearance,
    resolveMoveTarget,
    resolveRepositionTarget,
} from "./PathClearance.js";
export {
    RegionNode,
    computeDistanceTransform,
    generateVoronoiRegions,
    findRegionAdjacencies,
    repositionNodeCentroid,
} from "./VoronoiRegions.js";
export { readNavGrid } from "./NavGraph.js";
export { HierarchicalNavigator } from "./HierarchicalNavigator.js";
