import { generateLabRailMaze, centerMapGenBoundsOnViewport, refreshAllStampedRegionSurfaces, isIdxInMapGenBounds, getMapGenBoundsCenterIdx, getMapGenBoundsCenterWorld } from "../Spatial/spatial.js";
import { PortalLink } from "../Spatial/portals.js";
import { FloorBelt } from "../Spatial/belts.js";
import { spawnPlacedSandboxProp, spawnLinkedBallChain, resolveChainLinkRestLength } from "../Sandbox/sandbox.js";
import { syncLabViewportZoomUi } from "../../Apps/Editor/ui/labViewport.js";
import { rebuildLabMapCaches } from "../Render/render.js";
import { createSnakeGameSession } from "./snakeGameSession.js";
import { getNavWalkableCellIndex, filterWalkableCellsInBounds } from "../Navigation/navigation.js";
export const GAME_LAUNCHERS = {
    snake: {
        title: "Snake",
        hideEditor: false,
        defaultPathDebugMode: "reachable",
        async setup(state) {
            return createSnakeGameSession(state);
        },
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
function pickChainGrowDirOnWalkableCells(state, config, anchorIdx, segmentCount, spacing) {
    const grid = state.obstacleGrid;
    const walkable = new Set(collectMazeWalkableCells(state, config));
    const anchorX = grid.gridCenterXByIdx(anchorIdx);
    const anchorY = grid.gridCenterYByIdx(anchorIdx);
    for (let i = 0; i < CHAIN_GROW_DIRS.length; i++) {
        const { growDirX, growDirY } = CHAIN_GROW_DIRS[i];
        let lastX = anchorX;
        let lastY = anchorY;
        let ok = true;
        for (let seg = 1; seg < segmentCount; seg++) {
            lastX += growDirX * spacing;
            lastY += growDirY * spacing;
            const nIdx = grid.worldToIdx(lastX, lastY);
            if (nIdx < 0 || !walkable.has(nIdx)) {
                ok = false;
                break;
            }
        }
        if (ok) return CHAIN_GROW_DIRS[i];
    }
    return CHAIN_GROW_DIRS[0];
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
    const mazeCenter = getMapGenBoundsCenterWorld(grid, railMazeConfig);
    const playerAnchorIdx = pickWalkableCellIdxByDistance(state, railMazeConfig, mazeCenter.x, mazeCenter.y, false);
    if (playerAnchorIdx < 0) throw new Error("snake launch: no walkable maze cell for player spawn");
    const playerX = grid.gridCenterXByIdx(playerAnchorIdx);
    const playerY = grid.gridCenterYByIdx(playerAnchorIdx);
    const boid = spawnPlacedSandboxProp(state, playerX, playerY, "boid_triangle", "alpha");
    ctx.boid = boid;
    const enemyAnchorIdx = pickWalkableCellIdxByDistance(state, railMazeConfig, playerX, playerY, true);
    if (enemyAnchorIdx < 0) throw new Error("snake launch: no walkable maze cell for enemy spawn");
    const chainSpacing = resolveChainLinkRestLength(
        { radius: 4 },
        { radius: 4 },
        1.0,
    );
    const growDir = pickChainGrowDirOnWalkableCells(state, railMazeConfig, enemyAnchorIdx, 3, chainSpacing);
    const enemyChain = spawnLinkedBallChain(state, enemyAnchorIdx, {
        headBallType: "snake",
        ballType: "ball",
        segmentCount: 3,
        linkSlack: 1.0,
        faction: "beta",
        spacing: chainSpacing,
        growDirX: growDir.growDirX,
        growDirY: growDir.growDirY,
    });
    ctx.enemyChain = enemyChain;
    state.appLaunch?.session?.bind(ctx);
    if (state.sandbox?.controller?.session) {
        state.sandbox.controller.session.select({ kind: "prop", ids: [boid.id] });
        state.sandbox.controller.session.sync();
    }
    state.sandbox.entityMeta.setCameraTarget(boid.id, true);
    state.viewport.snapTo(playerX, playerY);
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
