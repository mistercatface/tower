import { applySandboxSceneSnapshot, SANDBOX_SCENE_SCHEMA_VERSION } from "../../../Libraries/Sandbox/sandboxSceneSnapshot.js";
import { spawnPlacedSandboxProp } from "../../../Libraries/Sandbox/sandboxPlacedSpawn.js";
import { SANDBOX_DEFAULT_FACTION, sandboxFactions } from "../../../Libraries/Sandbox/sandboxFaction.js";
import { forEachGlobalCellInMapGenBounds } from "../../../Libraries/Sandbox/mapGenBounds.js";
import { withSeededRandom } from "../../../Libraries/Random/index.js";
import { cellInRect } from "../../../Libraries/Spatial/grid/GridUtils.js";
import { applyPlayAreaConfig, generateLabCaverns } from "./mapWorld.js";
const STRESS_BALL_COUNT = 500;
const STRESS_BALL_TYPES = ["blue_ball", "orange_ball", "steel_ball", "beach_ball"];
const STRESS_FACTIONS = [sandboxFactions.alpha, sandboxFactions.bravo, sandboxFactions.charlie];
const STRESS_SHAPE_BATCHES = [
    { type: "hex_block", count: 100 },
    { type: "glass_pane", count: 100, randomBox: true },
    { type: "custom_box", count: 100, randomBox: true },
    { type: "crate", count: 100 },
    { type: "tri_wedge", count: 100 },
];
const STRESS_BOX_SIZE_MIN = 8;
const STRESS_BOX_SIZE_MAX = 64;
const STRESS_BOX_SIZE_STEP = 8;
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
function shuffleInPlace(items) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = items[i];
        items[i] = items[j];
        items[j] = tmp;
    }
}
function collectOpenCavernCells(state) {
    const grid = state.obstacleGrid;
    const cellSize = grid.cellSize;
    const open = [];
    forEachGlobalCellInMapGenBounds(state.editor.cavernConfig, (globalCol, globalRow) => {
        const { col, row } = grid.worldToGrid(globalCol * cellSize, globalRow * cellSize);
        if (!cellInRect(col, row, grid.cols, grid.rows)) return;
        if (grid.isBlocked(col, row)) return;
        open.push({ col, row });
    });
    return open;
}
function randomQuantizedBoxSize() {
    const steps = (STRESS_BOX_SIZE_MAX - STRESS_BOX_SIZE_MIN) / STRESS_BOX_SIZE_STEP + 1;
    return STRESS_BOX_SIZE_MIN + Math.floor(Math.random() * steps) * STRESS_BOX_SIZE_STEP;
}
function randomBoxHalfExtents() {
    const width = randomQuantizedBoxSize();
    const height = randomQuantizedBoxSize();
    return { x: width / 2, y: height / 2 };
}
function spawnCavernStressProps(state) {
    const grid = state.obstacleGrid;
    const cellSize = grid.cellSize;
    const openCells = collectOpenCavernCells(state);
    if (!openCells.length) throw new Error("Cavern has no open floor cells for prop placement");
    withSeededRandom(state.mapSeed + 2, () => {
        shuffleInPlace(openCells);
        let cellIndex = 0;
        const takeWorldPos = () => {
            if (cellIndex >= openCells.length) return null;
            const { col, row } = openCells[cellIndex++];
            const { x, y } = grid.gridToWorld(col, row);
            const jitter = cellSize * 0.35;
            return { x: x + (Math.random() - 0.5) * jitter, y: y + (Math.random() - 0.5) * jitter };
        };
        for (let i = 0; i < STRESS_BALL_COUNT; i++) {
            const pos = takeWorldPos();
            if (!pos) break;
            const type = STRESS_BALL_TYPES[Math.floor(Math.random() * STRESS_BALL_TYPES.length)];
            const faction = STRESS_FACTIONS[i % STRESS_FACTIONS.length];
            spawnPlacedSandboxProp(state, pos.x, pos.y, type, faction);
        }
        for (let b = 0; b < STRESS_SHAPE_BATCHES.length; b++) {
            const batch = STRESS_SHAPE_BATCHES[b];
            for (let i = 0; i < batch.count; i++) {
                const pos = takeWorldPos();
                if (!pos) return;
                const halfExtents = batch.randomBox ? randomBoxHalfExtents() : undefined;
                spawnPlacedSandboxProp(state, pos.x, pos.y, batch.type, SANDBOX_DEFAULT_FACTION, 0, halfExtents);
            }
        }
    });
}
/** Replace the sandbox with a procedural cavern and hundreds of balls for props/pathfinding stress tests. */
export async function spawnSandboxStartScene(state) {
    await applyPlayAreaConfig(state);
    await applySandboxSceneSnapshot(state, buildEmptySandboxDoc(state));
    await generateLabCaverns(state);
    spawnCavernStressProps(state);
}
