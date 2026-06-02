import { gridSettings } from "./Config/Config.js";
import { mapGenCanvasBounds } from "./tile-lab-settings.js";
import { GamePhase } from "./GameState/GamePhase.js";
import { GameState } from "./GameState/GameState.js";
import { MapGenerator } from "./Generator/MapGenerator.js";
import { getStartNodeLayout } from "./Generator/StartNodeBuilding.js";

/** @type {(() => number) | null} */
let savedRandom = null;

export function withSeededRandom(seed, fn) {
    let s = (seed >>> 0) || 1;
    savedRandom = Math.random;
    Math.random = () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
    try {
        return fn();
    } finally {
        if (savedRandom) {
            Math.random = savedRandom;
            savedRandom = null;
        }
    }
}

/**
 * Full run map — same pipeline as a new game (all nodes, walls, obstacle grid).
 * @param {{ canvasWidth?: number, canvasHeight?: number, mapSeed?: number, floorTileSeed?: number }} options
 */
export function createLabMapWorld(options = {}) {
    const {
        mapSeed = Date.now() & 0x7fffffff,
        floorTileSeed,
    } = options;

    const state = new GameState();
    state.canvasBounds = { ...mapGenCanvasBounds };
    state.phase = GamePhase.COMBAT;

    withSeededRandom(mapSeed, () => {
        MapGenerator.generateMap(state);
    });

    if (floorTileSeed != null) {
        state.floorTileSeed = floorTileSeed;
        state.floorTiles.clear();
    }

    state.__mapSeed = mapSeed;
    state.__baseGetCurrentMapNode = state.getCurrentMapNode.bind(state);
    return state;
}

/** Route floor/wall bakes through the tile lab profile id. */
export function applyLabProfileOverride(state, profileId) {
    const base = state.__baseGetCurrentMapNode ?? state.getCurrentMapNode.bind(state);
    state.getCurrentMapNode = () => {
        const node = base();
        if (!node) {
            return { floorTextureProfileId: profileId };
        }
        return { ...node, floorTextureProfileId: profileId };
    };
}

export function restoreLabProfileOverride(state) {
    if (state.__baseGetCurrentMapNode) {
        state.getCurrentMapNode = state.__baseGetCurrentMapNode;
    }
}

/** Move player to a map node combat position; returns world coords. */
export function focusLabNode(state, nodeId) {
    state.currentNodeId = nodeId;
    const node = state.getMapNode(nodeId);
    if (!node) {
        return { x: state.player.x, y: state.player.y };
    }
    const combatCoords = state.getNodeCombatCoords(node);
    if (nodeId === 0) {
        const layout = getStartNodeLayout(combatCoords.x, combatCoords.y, gridSettings.cellSize);
        state.player.x = layout.spawnX;
        state.player.y = layout.spawnY;
        return { x: layout.spawnX, y: layout.spawnY };
    }
    state.player.x = combatCoords.x;
    state.player.y = combatCoords.y;
    return { x: combatCoords.x, y: combatCoords.y };
}

export function listLabMapNodes(state) {
    return state.mapNodes
        .map((n) => ({ id: n.id, layer: n.layer, strategy: n.strategy ?? "?" }))
        .sort((a, b) => a.layer - b.layer || a.id - b.id);
}
