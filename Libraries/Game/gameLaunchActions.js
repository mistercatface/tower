import { rebuildLabMapCaches } from "../Render/map/labMapCaches.js";
import { BELT_CRATE_PUZZLE_DEFAULT_AREA_COLS, BELT_CRATE_PUZZLE_DEFAULT_AREA_ROWS, stampBeltCratePuzzleAt } from "../RoomGraph/puzzleTemplateBeltCrate.js";
import { setSandboxCameraTarget } from "../Sandbox/sandboxCameraTarget.js";
/** @typedef {{ stamped?: NonNullable<ReturnType<typeof stampBeltCratePuzzleAt>>, cameraTarget?: object }} GameLaunchContext */
/** @param {object} state @param {GameLaunchContext} ctx */
export function stampBeltCratePuzzleAction(state, ctx) {
    const grid = state.obstacleGrid;
    const { viewport } = state;
    const center = grid.worldToGrid(viewport.x, viewport.y);
    const areaCols = BELT_CRATE_PUZZLE_DEFAULT_AREA_COLS;
    const areaRows = BELT_CRATE_PUZZLE_DEFAULT_AREA_ROWS;
    const areaCol = center.col - ((areaCols / 2) | 0);
    const areaRow = center.row - ((areaRows / 2) | 0);
    const stamped = stampBeltCratePuzzleAt(state, areaCol, areaRow, areaCols, areaRows);
    if (!stamped) throw new Error("Failed to stamp belt + crate puzzle in play area");
    ctx.stamped = stamped;
}
/** @param {object} state */
function findBlueBallProp(state) {
    let ball = null;
    state.entityRegistry.forEachOfKind("worldProp", (prop) => {
        if (prop.isDead || prop.type !== "blue_ball") return;
        ball = prop;
    });
    return ball;
}
/** @param {object} state @param {GameLaunchContext} ctx */
export function focusBlueBallAction(state, ctx) {
    const ball = findBlueBallProp(state);
    if (!ball) throw new Error("Belt + crate puzzle stamped but blue ball prop is missing");
    setSandboxCameraTarget(state, ball, true);
    ctx.cameraTarget = ball;
}
/** @param {object} state @param {GameLaunchContext} ctx */
export function snapCameraToTargetAction(state, ctx) {
    const target = ctx.cameraTarget;
    if (!target) throw new Error("snapCameraToTarget requires focusBlueBall first");
    state.viewport.snapTo(target.x, target.y);
}
/** @param {object} state */
export async function refreshWorldAfterGameLaunch(state) {
    await state.navigation.onObstaclesChanged(null);
    state.worldSurfaces.clearBakeCache();
    await rebuildLabMapCaches(state);
}
