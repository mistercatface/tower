import { rebuildLabMapCaches } from "../Render/map/labMapCaches.js";
import { getPropVisualTint } from "../Color/visualOverride.js";
import { PUZZLE_TEMPLATE_BALL_TINTS } from "../Color/tintPresets.js";
import { findLiveWorldProp } from "../../GameState/EntityRegistry.js";
import { BELT_CRATE_PUZZLE_DEFAULT_AREA_COLS, BELT_CRATE_PUZZLE_DEFAULT_AREA_ROWS, stampBeltCratePuzzleAt } from "../RoomGraph/puzzleTemplateBeltCrate.js";
import { setSandboxCameraTarget } from "../Sandbox/sandboxCameraTarget.js";
import { spawnPlacedSandboxProp } from "../Sandbox/sandboxPlacedSpawn.js";
import { generateLabRailMaze } from "../../Apps/Editor/world/mapWorld.js";
import { syncLabViewportZoomUi } from "../../Apps/Editor/ui/labViewport.js";
/** @typedef {{ stamped?: NonNullable<ReturnType<typeof stampBeltCratePuzzleAt>>, cameraTarget?: object }} GameLaunchContext */
/** @param {object} state @param {GameLaunchContext} ctx */
export function stampBeltCratePuzzleAction(state, ctx) {
    const grid = state.obstacleGrid;
    const { viewport } = state;
    const centerCol = grid.worldCol(viewport.x);
    const centerRow = grid.worldRow(viewport.y);
    const areaCols = BELT_CRATE_PUZZLE_DEFAULT_AREA_COLS;
    const areaRows = BELT_CRATE_PUZZLE_DEFAULT_AREA_ROWS;
    const areaCol = centerCol - ((areaCols / 2) | 0);
    const areaRow = centerRow - ((areaRows / 2) | 0);
    const stamped = stampBeltCratePuzzleAt(state, areaCol, areaRow, areaCols, areaRows);
    if (!stamped) throw new Error("Failed to stamp belt + crate puzzle in play area");
    ctx.stamped = stamped;
}
/** @param {object} state */
function findPuzzleBallProp(state) {
    return findLiveWorldProp(state.worldProps, (prop) => prop.type === "ball" && getPropVisualTint(prop) === PUZZLE_TEMPLATE_BALL_TINTS.roomA);
}
/** @param {object} state @param {GameLaunchContext} ctx */
export function focusBlueBallAction(state, ctx) {
    const ball = findPuzzleBallProp(state);
    if (!ball) throw new Error("Belt + crate puzzle stamped but room A ball prop is missing");
    setSandboxCameraTarget(state, ball, true);
    ctx.cameraTarget = ball;
}
/** @param {object} state @param {GameLaunchContext} ctx */
export function snapCameraToTargetAction(state, ctx) {
    const target = ctx.cameraTarget;
    if (!target) throw new Error("snapCameraToTarget requires a camera target from a focus action");
    state.viewport.snapTo(target.x, target.y);
}
/** @param {object} state */
export async function refreshWorldAfterGameLaunch(state) {
    await state.nav.commitEdit(null, { fullNavSync: true });
    state.worldSurfaces.clearBakeCache();
    await rebuildLabMapCaches(state);
}

export async function generateRailMazeAction(state) {
    state.editor.railMazeConfig.edgeThickness = 4;
    state.editor.railMazeConfig.wallHeightLevel = 1;
    state.editor.railMazeConfig.surfaceProfileId = "poolTableFelt";
    await generateLabRailMaze(state);
}

export function spawnBoidTriangleAction(state, ctx) {
    const x = state.viewport.x;
    const y = state.viewport.y;
    const boid = spawnPlacedSandboxProp(state, x, y, "boid_triangle", "neutral");
    ctx.boid = boid;
}

export function focusBoidTriangleAction(state, ctx) {
    const boid = ctx.boid;
    if (boid) {
        setSandboxCameraTarget(state, boid, true);
        state.viewport.zoom = 2.0;
        syncLabViewportZoomUi(state);
        state.viewport.snapTo(boid.x, boid.y);
    }
}

export function setShadowsFullAction(state) {
    state.losShadowStrength = 1.0;
    if (typeof document !== "undefined") {
        const shadowSlider = document.getElementById("editorShadowSlider");
        const shadowValue = document.getElementById("editorShadowValue");
        if (shadowSlider && shadowValue) {
            shadowSlider.value = "100";
            shadowValue.textContent = "100%";
        }
    }
}
