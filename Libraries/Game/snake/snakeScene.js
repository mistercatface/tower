import { applySandboxSceneSnapshot, SANDBOX_SCENE_SCHEMA_VERSION } from "../../Sandbox/sandboxSceneSnapshot.js";
import { colRowToIndex } from "../../Spatial/grid/GridUtils.js";
import { getNavWalkableCellIndex, pickWalkableCell, createNavWalkableAccess } from "../../Procedural/Mazes/walkableCells.js";
import { cellChebyshevDistance } from "../../Navigation/steering/exploreSteering.js";
import { linkedChainOccupiedCellIndices, spawnLinkedBallChain } from "../../Sandbox/spawnLinkedBallChain.js";
import { withSeededRandom, shuffleInPlace } from "../../Random/index.js";
import { applyPlayAreaConfig, generateLabCaverns, generateLabRailMaze, clearSnakeRegionPaddingStrip } from "../../../Apps/Editor/world/mapWorld.js";
import { commitGridNavEdit } from "../../Sandbox/gridNavEdit.js";
import { migrateMapGenBoundsForMode } from "../../Sandbox/mapGenBounds.js";
import { getSnakeGameConfig, resolveSnakeSegmentSpacing, resolveSnakeSpawnSpecs } from "./snakeGameConfig.js";
import { applySnakeChainTint, pickSnakeChainTintHex } from "./snakeChainColor.js";
import { applyAgentGameplay } from "./applyAgentGameplay.js";
import { AGENT_PROFILE } from "../../AI/agents/agentProfile.js";
import { setAgentIdentity, pickRandomName } from "../../AI/identity/agentIdentity.js";
export const SNAKE_CHAIN_EXPORT_TYPE = "snake_chain";
function buildEmptySandboxDoc(state) {
    const grid = state.obstacleGrid;
    return {
        schemaVersion: SANDBOX_SCENE_SCHEMA_VERSION,
        cellSize: grid.cellSize,
        origin: { minX: grid.minX, minY: grid.minY },
        cols: grid.cols,
        rows: grid.rows,
        voxels: [],
        railWalls: [],
        forcefields: [],
        floorBelts: [],
        powerSources: [],
        props: [],
        roomGraph: { nodes: [], links: [], nextNodeId: 0, nextLinkId: 0 },
    };
}
function chainAnchorOccupiedCells(grid, anchorCell, segmentCount, spacing, growDirX, growDirY) {
    const anchorWorld = grid.gridToWorld(anchorCell.col, anchorCell.row);
    const cells = [];
    for (let i = 0; i < segmentCount; i++) {
        const x = anchorWorld.x + i * spacing * growDirX;
        const y = anchorWorld.y + i * spacing * growDirY;
        cells.push(grid.worldToGrid(x, y));
    }
    return cells;
}
function isValidSnakeChainAnchorCell(navWalkable, grid, anchorCell, segmentCount, spacing, growDirX, growDirY, excludeIndices) {
    const cells = chainAnchorOccupiedCells(grid, anchorCell, segmentCount, spacing, growDirX, growDirY);
    for (let i = 0; i < cells.length; i++) {
        const { col, row } = cells[i];
        if (!navWalkable.has(col, row)) return false;
        if (excludeIndices?.has(colRowToIndex(col, row, grid.cols))) return false;
    }
    return true;
}
function pickSnakeChainSpawnCellNearestTo(spawnPool, navWalkable, state, targetCol, targetRow, { segmentCount, spacing, growDirX, growDirY, excludeIndices }) {
    const grid = state.obstacleGrid;
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < spawnPool.length; i++) {
        const cell = spawnPool[i];
        if (!isValidSnakeChainAnchorCell(navWalkable, grid, cell, segmentCount, spacing, growDirX, growDirY, excludeIndices)) continue;
        const dist = cellChebyshevDistance(targetCol, targetRow, cell.col, cell.row);
        if (dist < bestDist) {
            bestDist = dist;
            best = cell;
        }
    }
    if (!best) throw new Error("No walkable snake spawn cell near map center");
    return best;
}
export function pickSnakeChainSpawnCell(spawnPool, navWalkable, state, { segmentCount, spacing, growDirX, growDirY, excludeIndices, rng = Math.random }) {
    const grid = state.obstacleGrid;
    const valid = [];
    for (let i = 0; i < spawnPool.length; i++) {
        const cell = spawnPool[i];
        if (isValidSnakeChainAnchorCell(navWalkable, grid, cell, segmentCount, spacing, growDirX, growDirY, excludeIndices)) valid.push(cell);
    }
    if (!valid.length) throw new Error("No walkable snake spawn cell with full chain clearance");
    return pickWalkableCell(valid, { cols: grid.cols, excludeIndices, rng });
}
function applySnakeSplitMapGenBounds(state, paddingCells) {
    const { cavernConfig, railConfig, playConfig } = state.editor;
    const padding = Math.max(0, Math.round(paddingCells));
    const baseCol = cavernConfig.boundsCol;
    const baseRow = cavernConfig.boundsRow;
    const cols = cavernConfig.boundsCols;
    const innerRows = Math.max(2, playConfig.playAreaRows - padding);
    const topRows = Math.floor(innerRows / 2);
    const bottomRows = innerRows - topRows;
    cavernConfig.boundsCol = baseCol;
    cavernConfig.boundsRow = baseRow;
    cavernConfig.boundsCols = cols;
    cavernConfig.boundsRows = topRows;
    migrateMapGenBoundsForMode(cavernConfig);
    railConfig.boundsCol = baseCol;
    railConfig.boundsRow = baseRow + topRows + padding;
    railConfig.boundsCols = cols;
    railConfig.boundsRows = bottomRows;
    migrateMapGenBoundsForMode(railConfig);
    state.sandbox.snakePlayableBounds = { boundsMode: "rect", boundsCol: baseCol, boundsRow: baseRow, boundsCols: cols, boundsRows: innerRows };
}
export function resolveSnakePlayableBounds(state) {
    return state.sandbox.snakePlayableBounds;
}
export async function generateSnakeSplitMap(state) {
    const config = getSnakeGameConfig();
    const cavern = config.cavern;
    await applyPlayAreaConfig(state);
    applySnakeSplitMapGenBounds(state, cavern.regionPaddingCells ?? 4);
    await applySandboxSceneSnapshot(state, buildEmptySandboxDoc(state));
    const { cavernConfig, railConfig } = state.editor;
    const prevCavernWallHeightLevel = cavernConfig.wallHeightLevel;
    const prevRailWallHeightLevel = railConfig.wallHeightLevel;
    const prevCavernFillChance = cavernConfig.fillChance;
    const prevCavernIterations = cavernConfig.iterations;
    const prevRailEdgeThickness = railConfig.edgeThickness;
    cavernConfig.wallHeightLevel = cavern.wallHeightLevel;
    railConfig.wallHeightLevel = config.rail.wallHeightLevel;
    if (cavern.fillChance != null) cavernConfig.fillChance = cavern.fillChance;
    if (cavern.iterations != null) cavernConfig.iterations = cavern.iterations;
    if (config.rail.edgeThickness != null) railConfig.edgeThickness = config.rail.edgeThickness;
    await generateLabCaverns(state, { openBoundarySides: { south: true }, openBoundaryRows: cavern.openBoundaryRows ?? 2 });
    const rail = config.rail;
    const playable = resolveSnakePlayableBounds(state);
    const floodSeed = resolveSnakeNavWalkableFloodSeedBounds(state);
    const navWalkableIndex = getNavWalkableCellIndex(state, playable, floodSeed);
    await generateLabRailMaze(state, {
        boundsConfig: railConfig,
        railWallHeightLevel: rail.wallHeightLevel,
        railWallThicknessLevel: rail.edgeThickness,
        corridorWidthMin: rail.corridorWidthMin ?? 1,
        corridorWidthMax: rail.corridorWidthMax ?? 2,
        extraLinkRatio: rail.extraLinkRatio,
        northReserveRows: cavern.openBoundaryRows ?? 3,
        floodSeedBounds: floodSeed,
        navWalkableIndex,
    });
    const paddingBounds = clearSnakeRegionPaddingStrip(state, cavern.regionPaddingCells ?? 4);
    await commitGridNavEdit(state, paddingBounds);
    cavernConfig.wallHeightLevel = prevCavernWallHeightLevel;
    railConfig.wallHeightLevel = prevRailWallHeightLevel;
    cavernConfig.fillChance = prevCavernFillChance;
    cavernConfig.iterations = prevCavernIterations;
    railConfig.edgeThickness = prevRailEdgeThickness;
}
export function resolveSnakeNavWalkableFloodSeedBounds(state) {
    const playable = resolveSnakePlayableBounds(state);
    const globalCol = playable.boundsCol + Math.floor(playable.boundsCols / 2);
    const globalRow = playable.boundsRow + Math.floor(playable.boundsRows / 2);
    return { boundsMode: "rect", boundsCol: globalCol, boundsRow: globalRow, boundsCols: 1, boundsRows: 1 };
}
export function resolveSnakePlayableCenterCell(state) {
    const seed = resolveSnakeNavWalkableFloodSeedBounds(state);
    const cellSize = state.obstacleGrid.cellSize;
    return state.obstacleGrid.worldToGrid(seed.boundsCol * cellSize, seed.boundsRow * cellSize);
}
export function resolveCenterSnakeSpawnAnchor(state, navWalkable, { segmentCount, excludeIndices = null }) {
    const config = getSnakeGameConfig();
    const centerCell = resolveSnakePlayableCenterCell(state);
    return pickSnakeChainSpawnCellNearestTo(navWalkable.cells(), navWalkable, state, centerCell.col, centerCell.row, {
        segmentCount,
        spacing: resolveSnakeSegmentSpacing(config.agentProfiles.snake.linkSlack, config.startRadius),
        growDirX: config.agentProfiles.snake.growDirX,
        growDirY: config.agentProfiles.snake.growDirY,
        excludeIndices,
    });
}
async function spawnSnakeCavernMap(state) {
    await generateSnakeSplitMap(state);
}
export function spawnSnakeChain(state, anchorCell, { excludeIndices = null, segmentCount, faction = null, rng = Math.random } = {}) {
    const config = getSnakeGameConfig();
    const snake = config.agentProfiles.snake;
    const startRadius = config.startRadius;
    const resolvedSegmentCount = segmentCount ?? snake.segmentCount;
    const name = pickRandomName(rng);
    const resolvedFaction = faction;
    const tintHex = pickSnakeChainTintHex(resolvedFaction, rng);
    const chain = spawnLinkedBallChain(state, anchorCell, {
        segmentCount: resolvedSegmentCount,
        spacing: resolveSnakeSegmentSpacing(snake.linkSlack, startRadius),
        segmentRadius: startRadius,
        linkSlack: snake.linkSlack,
        ballType: snake.bodyPropId,
        headBallType: snake.headPropId,
        growDirX: snake.growDirX,
        growDirY: snake.growDirY,
        faction: resolvedFaction,
        exportType: SNAKE_CHAIN_EXPORT_TYPE,
    });
    setAgentIdentity(chain.head.id, { name, color: tintHex });
    applySnakeChainTint(chain.members, tintHex);
    applyAgentGameplay(AGENT_PROFILE.snake, chain.head, "leader");
    for (let i = 1; i < chain.members.length; i++) applyAgentGameplay(AGENT_PROFILE.snake, chain.members[i], "body");
    const occupiedIndices = new Set(excludeIndices ?? []);
    const occupied = linkedChainOccupiedCellIndices(chain.members, state.obstacleGrid);
    for (const idx of occupied) occupiedIndices.add(idx);
    return { chain, tintHex, occupiedIndices };
}
export async function spawnSnakeCavernScene(state) {
    const config = getSnakeGameConfig();
    await spawnSnakeCavernMap(state);
    const navWalkable = createNavWalkableAccess(state, resolveSnakePlayableBounds(state), { floodSeedBounds: resolveSnakeNavWalkableFloodSeedBounds(state) });
    navWalkable.rebake();
    const spawnCells = navWalkable.cells();
    const snakes = [];
    withSeededRandom(state.mapSeed + config.cavern.mapSeedOffset, () => {
        const specs = resolveSnakeSpawnSpecs(
            config.agentProfiles.snake.minAliveSegmentCount ?? 3,
            config.agentProfiles.snake.maxAliveSegmentCount ?? 3,
            config.agentProfiles.snake.populationCount ?? 0,
            Math.random,
        );
        const spacing = resolveSnakeSegmentSpacing(config.agentProfiles.snake.linkSlack, config.startRadius);
        const growDirX = config.agentProfiles.snake.growDirX;
        const growDirY = config.agentProfiles.snake.growDirY;
        let excludeIndices = null;
        const centerSegmentCount = specs[0].segmentCount;
        const centerAnchor = resolveCenterSnakeSpawnAnchor(state, navWalkable, { segmentCount: centerSegmentCount, excludeIndices });
        const centerPack = spawnSnakeChain(state, centerAnchor, { excludeIndices, segmentCount: centerSegmentCount, faction: "red" });
        snakes.push(centerPack);
        excludeIndices = centerPack.occupiedIndices;
        const shuffledSpawnCells = spawnCells.slice();
        shuffleInPlace(shuffledSpawnCells);
        for (let i = 1; i < specs.length; i++) {
            const spec = specs[i];
            const segmentCount = spec.segmentCount;
            const anchorCell = pickSnakeChainSpawnCell(shuffledSpawnCells, navWalkable, state, { segmentCount, spacing, growDirX, growDirY, excludeIndices });
            const faction = i % 3 === 0 ? "red" : i % 3 === 1 ? "blue" : "purple";
            const pack = spawnSnakeChain(state, anchorCell, { excludeIndices, segmentCount: spec.segmentCount, faction });
            snakes.push(pack);
            excludeIndices = pack.occupiedIndices;
        }
    });
    return { snakes, navWalkable };
}
