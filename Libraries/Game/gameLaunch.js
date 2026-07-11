import { generateLabRailMaze, centerMapGenBoundsOnViewport, refreshAllStampedRegionSurfaces, isIdxInMapGenBounds, getMapGenBoundsCenterIdx, getMapGenBoundsCenterWorldF32, clearAllStampedGridWalls } from "../Spatial/spatial.js";
import { PortalLink } from "../Spatial/portals.js";
import { FloorBelt } from "../Spatial/belts.js";
import { spawnPlacedSandboxProp } from "../Sandbox/sandbox.js";
import { GRAB_DRAG_BEHAVIOR_ID } from "../Sandbox/dragBehaviors.js";
import { syncLabViewportZoomUi } from "../../Apps/Editor/ui/labViewport.js";
import { rebuildLabMapCaches } from "../Render/render.js";
import { createGlassGameSession } from "./glassGameSession.js";
import { getNavWalkableCellIndex, filterWalkableCellsInBounds } from "../Navigation/navigation.js";
import { applyPropBoxFootprint } from "../Props/props.js";
import { ENGINE_F32, M_VEC_A } from "../../Core/engineMemory.js";
export const GAME_LAUNCHERS = {
    snake: {
        title: "Snake",
        hideEditor: false,
        defaultPathDebugMode: "reachable",
        async setup(state) {
            return { bind() {}, tick() {} };
        },
        async launch(state, ctx) {
            await runSnakeLaunch(state, ctx);
        },
    },
    glass: {
        title: "Glass",
        hideEditor: false,
        defaultPathDebugMode: "off",
        async setup(state) {
            return createGlassGameSession(state);
        },
        async launch(state, ctx) {
            await runGlassLaunch(state, ctx);
        },
    },
};
export function parseGameLaunchQuery(search = window.location.search) {
    const game = new URLSearchParams(search).get("game");
    return game || null;
}
const SNAKE_RAIL_MAZE_COLS = 64;
const SNAKE_RAIL_MAZE_ROWS = 64;
const CHAIN_GROW_DIRS = [
    { growDirX: -1, growDirY: 0 },
    { growDirX: 1, growDirY: 0 },
    { growDirX: 0, growDirY: -1 },
    { growDirX: 0, growDirY: 1 },
];
function mazeFloodSeedBounds(grid, config) {
    const centerIdx = getMapGenBoundsCenterIdx(grid, config);
    return { boundsMode: "rect", boundsIdx: centerIdx, boundsCols: 1, boundsRows: 1 };
}
function collectMazeWalkableCells(state, config) {
    const index = getNavWalkableCellIndex(state, config, mazeFloodSeedBounds(state.obstacleGrid, config));
    return filterWalkableCellsInBounds(index.cells, state.obstacleGrid, config);
}
function pickWalkableCellIdxByDistance(state, config, worldX, worldY, pickFarthest) {
    const grid = state.obstacleGrid;
    const cells = collectMazeWalkableCells(state, config);
    if (cells.length === 0) return -1;
    let bestIdx = cells[0];
    let bestDist = pickFarthest ? -1 : Infinity;
    for (let i = 0; i < cells.length; i++) {
        const idx = cells[i];
        const cx = grid.gridCenterXByIdx(idx);
        const cy = grid.gridCenterYByIdx(idx);
        const dist = Math.hypot(cx - worldX, cy - worldY);
        if (pickFarthest ? dist > bestDist : dist < bestDist) {
            bestDist = dist;
            bestIdx = idx;
        }
    }
    return bestIdx;
}
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
    for (let i = 0; i < 5; i++) placeRandomPortalPair(state, railMazeConfig);
    await state.nav.commitEdit(null, { fullNavSync: true });
    const grid = state.obstacleGrid;
    getMapGenBoundsCenterWorldF32(ENGINE_F32, M_VEC_A, grid, railMazeConfig);
    const playerAnchorIdx = pickWalkableCellIdxByDistance(state, railMazeConfig, ENGINE_F32[M_VEC_A], ENGINE_F32[M_VEC_A + 1], false);
    if (playerAnchorIdx < 0) throw new Error("snake launch: no walkable maze cell for player spawn");
    const playerX = grid.gridCenterXByIdx(playerAnchorIdx);
    const playerY = grid.gridCenterYByIdx(playerAnchorIdx);
    const boid = spawnPlacedSandboxProp(state, playerX, playerY, "boid_triangle", "alpha");
    ctx.boid = boid;
    state.appLaunch?.session?.bind(ctx);
    if (state.sandbox?.controller?.session) {
        state.sandbox.controller.session.select({ kind: "prop", ids: [boid.id] });
        state.sandbox.controller.session.sync();
    }
    state.sandbox.entityMeta.setCameraTarget(boid.id, true);
    state.viewport.snapTo(playerX, playerY);
    state.viewport.setZoom(2.0);
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
async function runGlassLaunch(state, ctx) {
    const railConfig = state.editor.railConfig;
    railConfig.edgeThickness = 4;
    railConfig.wallHeightLevel = 1;
    railConfig.surfaceProfileId = "poolTableFelt";
    railConfig.boundsMode = "rect";
    railConfig.boundsCols = 64;
    railConfig.boundsRows = 64;
    centerMapGenBoundsOnViewport(state.obstacleGrid, { x: 0, y: 0 }, railConfig);
    clearAllStampedGridWalls(state, { notify: false });
    state.obstacleGrid.clearAllFloorCells();
    refreshAllStampedRegionSurfaces(state);
    await state.nav.commitEdit(null, { fullNavSync: true });
    const grid = state.obstacleGrid;
    getMapGenBoundsCenterWorldF32(ENGINE_F32, M_VEC_A, grid, railConfig);
    const cx = ENGINE_F32[M_VEC_A];
    const cy = ENGINE_F32[M_VEC_A + 1];
    const pane = spawnPlacedSandboxProp(state, cx, cy, "glass_pane", "alpha");
    applyPropBoxFootprint(pane, 512, 512);
    const star = spawnPlacedSandboxProp(state, cx, cy - (512 + 24), "star_block", "alpha");
    state.appLaunch?.session?.bind(ctx);
    if (state.sandbox?.controller?.session) {
        state.sandbox.controller.session.select({ kind: "prop", ids: [star.id] });
        state.sandbox.controller.session.sync();
    }
    state.sandbox.entityMeta.setCameraTarget(star.id, true);
    state.viewport.snapTo(star.x, star.y);
    state.viewport.setZoom(2.0);
    syncLabViewportZoomUi(state);
    state.editor.lockSelection = false;
    state.editor.navMode = "off";
    state.sandbox.dragInteractionMode = GRAB_DRAG_BEHAVIOR_ID;
}
