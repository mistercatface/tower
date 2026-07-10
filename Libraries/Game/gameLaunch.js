import { generateLabRailMaze, centerMapGenBoundsOnViewport, refreshAllStampedRegionSurfaces, isIdxInMapGenBounds, getMapGenBoundsCenterIdx, getMapGenBoundsCenterWorldF32, generateLabRailCaverns } from "../Spatial/spatial.js";
import { PortalLink } from "../Spatial/portals.js";
import { FloorBelt } from "../Spatial/belts.js";
import { spawnPlacedSandboxProp, spawnLinkedBallChain, resolveChainLinkRestLength } from "../Sandbox/sandbox.js";
import { GRAB_DRAG_BEHAVIOR_ID } from "../Sandbox/dragBehaviors.js";
import { syncLabViewportZoomUi } from "../../Apps/Editor/ui/labViewport.js";
import { rebuildLabMapCaches } from "../Render/render.js";
import { createSnakeGameSession } from "./snakeGameSession.js";
import { createGlassGameSession } from "./glassGameSession.js";
import { getNavWalkableCellIndex, filterWalkableCellsInBounds } from "../Navigation/navigation.js";
import { setPropVisualTint } from "../Color/visualOverride.js";
import { applyPropBoxFootprint } from "../Props/props.js";
import { ENGINE_F32, M_VEC_A } from "../Math/math.js";
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
    getMapGenBoundsCenterWorldF32(ENGINE_F32, M_VEC_A, grid, railMazeConfig);
    const playerAnchorIdx = pickWalkableCellIdxByDistance(state, railMazeConfig, ENGINE_F32[M_VEC_A], ENGINE_F32[M_VEC_A + 1], false);
    if (playerAnchorIdx < 0) throw new Error("snake launch: no walkable maze cell for player spawn");
    const playerX = grid.gridCenterXByIdx(playerAnchorIdx);
    const playerY = grid.gridCenterYByIdx(playerAnchorIdx);
    const boid = spawnPlacedSandboxProp(state, playerX, playerY, "boid_triangle", "alpha");
    ctx.boid = boid;
    const enemyAnchorIdx = pickWalkableCellIdxByDistance(state, railMazeConfig, playerX, playerY, true);
    if (enemyAnchorIdx < 0) throw new Error("snake launch: no walkable maze cell for enemy spawn");
    const chainSpacing = resolveChainLinkRestLength({ radius: 4 }, { radius: 4 }, 1.0);
    const growDir = pickChainGrowDirOnWalkableCells(state, railMazeConfig, enemyAnchorIdx, 3, chainSpacing);
    const enemyChain = spawnLinkedBallChain(state, enemyAnchorIdx, { headBallType: "snake", ballType: "ball", segmentCount: 3, linkSlack: 1.0, faction: "beta", spacing: chainSpacing, growDirX: growDir.growDirX, growDirY: growDir.growDirY });
    ctx.enemyChain = enemyChain;
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
const RANDOM_COLORS = ["#f44336", "#e91e63", "#9c27b0", "#673ab7", "#3f51b5", "#2196f3", "#03a9f4", "#00bcd4", "#009688", "#4caf50", "#8bc34a", "#cddc39", "#ffeb3b", "#ffc107", "#ff9800", "#ff5722"];
async function runGlassLaunch(state, ctx) {
    const railConfig = state.editor.railConfig;
    railConfig.edgeThickness = 4;
    railConfig.wallHeightLevel = 1;
    railConfig.surfaceProfileId = "poolTableFelt";
    railConfig.boundsMode = "rect";
    railConfig.boundsCols = 64;
    railConfig.boundsRows = 64;
    railConfig.fillChance = 0.35;
    centerMapGenBoundsOnViewport(state.obstacleGrid, { x: 0, y: 0 }, railConfig);
    await generateLabRailCaverns(state);
    refreshAllStampedRegionSurfaces(state);
    await state.nav.commitEdit(null, { fullNavSync: true });
    const grid = state.obstacleGrid;
    const cells = collectMazeWalkableCells(state, railConfig);
    if (cells.length === 0) throw new Error("glass launch: no walkable cells");
    const walkableSet = new Set(cells);
    const chosenIndices = [];
    function pickRandomCellIdx(clearanceCells = 0) {
        for (let attempt = 0; attempt < 50; attempt++) {
            const idx = cells[Math.floor(Math.random() * cells.length)];
            const cols = grid.cols;
            const centerCol = idx % cols;
            const centerRow = Math.floor(idx / cols);
            let ok = true;
            if (clearanceCells > 0)
                for (let r = -clearanceCells; r <= clearanceCells; r++) {
                    for (let c = -clearanceCells; c <= clearanceCells; c++) {
                        const nIdx = (centerRow + r) * cols + (centerCol + c);
                        if (!walkableSet.has(nIdx)) {
                            ok = false;
                            break;
                        }
                    }
                    if (!ok) break;
                }
            if (!ok) continue;
            const cx = grid.gridCenterXByIdx(idx);
            const cy = grid.gridCenterYByIdx(idx);
            for (let i = 0; i < chosenIndices.length; i++) {
                const c = chosenIndices[i];
                const ox = grid.gridCenterXByIdx(c);
                const oy = grid.gridCenterYByIdx(c);
                if (Math.hypot(cx - ox, cy - oy) < 60) {
                    ok = false;
                    break;
                }
            }
            if (ok) {
                chosenIndices.push(idx);
                return idx;
            }
        }
        return cells[Math.floor(Math.random() * cells.length)];
    }
    const playerIdx = pickRandomCellIdx(2);
    const playerX = grid.gridCenterXByIdx(playerIdx);
    const playerY = grid.gridCenterYByIdx(playerIdx);
    const playerChainSpacing = resolveChainLinkRestLength({ radius: 4 }, { radius: 4 }, 1.0);
    const playerChain = spawnLinkedBallChain(state, playerIdx, { ballType: "snake", headBallType: "snake", segmentCount: 5, segmentRadius: 4, spacing: playerChainSpacing, growDirX: 1, growDirY: 0 });
    const playerProp = playerChain.leader;
    ctx.boid = playerProp;
    for (let i = 0; i < 8; i++) {
        const idx = pickRandomCellIdx(3);
        const x = grid.gridCenterXByIdx(idx);
        const y = grid.gridCenterYByIdx(idx);
        const pane = spawnPlacedSandboxProp(state, x, y, "glass_pane", "alpha");
        const width = 10 + Math.random() * 30;
        const height = 4 + Math.random() * 8;
        applyPropBoxFootprint(pane, width, height);
    }
    for (let i = 0; i < 4; i++) {
        const idx = pickRandomCellIdx(2);
        const radius = 3 + Math.random() * 5;
        const segmentCount = 6 + Math.floor(Math.random() * 10);
        const chainSpacing = resolveChainLinkRestLength({ radius }, { radius }, 1.0);
        const chain = spawnLinkedBallChain(state, idx, { ballType: "snake", headBallType: "snake", segmentCount, segmentRadius: radius, spacing: chainSpacing, growDirX: 1, growDirY: 0 });
        const color = RANDOM_COLORS[Math.floor(Math.random() * RANDOM_COLORS.length)];
        for (const prop of chain.members) setPropVisualTint(prop, color);
    }
    for (let i = 0; i < 4; i++) {
        const idx = pickRandomCellIdx(1);
        const x = grid.gridCenterXByIdx(idx);
        const y = grid.gridCenterYByIdx(idx);
        spawnPlacedSandboxProp(state, x, y, "cross_pinwheel", "alpha");
    }
    for (let i = 0; i < 5; i++) {
        const idx = pickRandomCellIdx(1);
        const x = grid.gridCenterXByIdx(idx);
        const y = grid.gridCenterYByIdx(idx);
        spawnPlacedSandboxProp(state, x, y, "boid_triangle", "alpha");
    }
    state.appLaunch?.session?.bind(ctx);
    if (state.sandbox?.controller?.session) {
        state.sandbox.controller.session.select({ kind: "prop", ids: [playerProp.id] });
        state.sandbox.controller.session.sync();
    }
    state.sandbox.entityMeta.setCameraTarget(playerProp.id, true);
    state.viewport.snapTo(playerX, playerY);
    state.viewport.setZoom(2.0);
    syncLabViewportZoomUi(state);
    state.editor.lockSelection = false;
    state.editor.navMode = "off";
    state.sandbox.dragInteractionMode = GRAB_DRAG_BEHAVIOR_ID;
}
