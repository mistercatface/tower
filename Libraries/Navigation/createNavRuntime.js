import { gridSettings } from "../../Config/Config.js";
import { FLOW_FIELD_WORKER_URL } from "../../Render/WorldSurfaceBootstrap.js";
import { FlowFieldGrid } from "../Pathfinding/FlowFieldGrid.js";
import { NavigationService } from "../../Systems/Navigation/NavigationService.js";
export const navigationSettings = {
    arrivalDistance: 2,
    recenterThreshold: 400,
    stuckReplanFrames: 20,
    stuckMoveThreshold: 1.5,
    targetNodeLookahead: 10,
    pathClearanceMargin: 4,
    pathWaypointArrival: 10,
    hpaDamagePadding: 12,
};
/** @param {import("../../GameState/SharedGameState.js").SharedGameState} state */
export function createNavRuntime(state) {
    state.flowFieldGrid = new FlowFieldGrid(gridSettings.cellSize, gridSettings.width, gridSettings.height, state.obstacleGrid, FLOW_FIELD_WORKER_URL);
    state.navigation = new NavigationService(state.flowFieldGrid, state.hierarchicalNavigator, navigationSettings);
}
