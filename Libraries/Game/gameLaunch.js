import { generateLabRailMaze, centerMapGenBoundsOnViewport, refreshAllStampedRegionSurfaces, isIdxInMapGenBounds } from "../Spatial/spatial.js";
import { PortalLink } from "../Spatial/portals.js";
import { FloorBelt } from "../Spatial/belts.js";
import { spawnPlacedSandboxProp } from "../Sandbox/sandbox.js";
import { syncLabViewportZoomUi } from "../../Apps/Editor/ui/labViewport.js";
import { rebuildLabMapCaches } from "../Render/render.js";
export const GAME_LAUNCHERS = {
    snake: {
        title: "Snake",
        hideEditor: false,
        defaultPathDebugMode: "reachable",
        async launch(state, ctx) {
            await runSnakeLaunch(state, ctx);
        },
    },
};
export function parseGameLaunchQuery(search = window.location.search) {
    const game = new URLSearchParams(search).get("game");
    return game || null;
}
const SNAKE_RAIL_MAZE_COLS = 64;
const SNAKE_RAIL_MAZE_ROWS = 64;
function collectOpenCells(grid, config) {
    const size = grid.cols * grid.rows;
    const open = [];
    for (let idx = 0; idx < size; idx++) if (grid.grid[idx] === 0 && !FloorBelt.isBeltAtIdx(grid, idx) && isIdxInMapGenBounds(config, grid, idx)) open.push(idx);
    return open;
}
function placeRandomPortalPair(state, config) {
    const grid = state.obstacleGrid;
    const open = collectOpenCells(grid, config);
    if (open.length < 2) return null;
    const cols = grid.cols;
    const minSeparation = Math.max(config.boundsCols, config.boundsRows) * 0.4;
    const exitIdx = open[(Math.random() * open.length) | 0];
    const exitCol = exitIdx % cols;
    const exitRow = (exitIdx / cols) | 0;
    let entryIdx = -1;
    for (let attempt = 0; attempt < 64; attempt++) {
        const candidate = open[(Math.random() * open.length) | 0];
        if (candidate === exitIdx) continue;
        const dCol = (candidate % cols) - exitCol;
        const dRow = ((candidate / cols) | 0) - exitRow;
        if (Math.hypot(dCol, dRow) >= minSeparation) {
            entryIdx = candidate;
            break;
        }
    }
    if (entryIdx < 0)
        for (let i = 0; i < open.length; i++)
            if (open[i] !== exitIdx) {
                entryIdx = open[i];
                break;
            }
    if (entryIdx < 0) return null;
    PortalLink.setLink(grid, exitIdx, entryIdx);
    return { exitIdx, entryIdx };
}
async function runSnakeLaunch(state, ctx) {
    const railMazeConfig = state.editor.railMazeConfig;
    const railConfig = state.editor.railConfig;
    railMazeConfig.edgeThickness = 4;
    railMazeConfig.wallHeightLevel = 1;
    railMazeConfig.surfaceProfileId = "poolTableFelt";
    railMazeConfig.boundsMode = "rect";
    railMazeConfig.boundsCols = SNAKE_RAIL_MAZE_COLS;
    railMazeConfig.boundsRows = SNAKE_RAIL_MAZE_ROWS;
    railConfig.boundsMode = "rect";
    railConfig.boundsCols = SNAKE_RAIL_MAZE_COLS;
    railConfig.boundsRows = SNAKE_RAIL_MAZE_ROWS;
    centerMapGenBoundsOnViewport(state.obstacleGrid, { x: 0, y: 0 }, railMazeConfig);
    await generateLabRailMaze(state);
    refreshAllStampedRegionSurfaces(state);
    ctx.portalPair = placeRandomPortalPair(state, railMazeConfig);
    await state.nav.commitEdit(null, { fullNavSync: true });
    const x = state.viewport.x;
    const y = state.viewport.y;
    const boid = spawnPlacedSandboxProp(state, x, y, "boid_triangle", "alpha");
    ctx.boid = boid;
    if (state.sandbox?.controller?.session) {
        state.sandbox.controller.session.select({ kind: "prop", ids: [boid.id] });
        state.sandbox.controller.session.sync();
    }
    // 3. Focus Camera and Zoom to 2.0
    state.sandbox.entityMeta.setCameraTarget(boid.id, true);
    state.viewport.zoom = 2.0;
    syncLabViewportZoomUi(state);
    state.editor.lockSelection = true;
}
/** @param {object} state @param {object} launcher @param {{ playbackHandlers?: import("../Playback/speedControl.js").PlaybackHandlers }} [launchOptions] */
export async function runGameLaunch(state, launcher, launchOptions = {}) {
    const ctx = {};
    if (launcher.setup) state.appLaunch.session = await launcher.setup(state, launchOptions);
    if (launcher.launch) await launcher.launch(state, ctx);
    // Refresh world caches
    await state.nav.commitEdit(null, { fullNavSync: true });
    state.worldSurfaces.clearBakeCache();
    await rebuildLabMapCaches(state);
    return ctx;
}
