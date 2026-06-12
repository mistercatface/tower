import { Segment } from "../../Entities/Wall.js";
import { removeWorldPropFromState } from "../../GameState/EntityRegistry.js";
import { createAabb } from "../Math/Aabb2D.js";
import { forEachObstacleGridCellInAabb } from "../Spatial/grid/GridCoords.js";
import { padStampBoundsInto } from "../Spatial/zones/floorShapes.js";
import { addSandboxWalls, removeSandboxWalls } from "./spawnAssembly.js";

const fixtureStampScratch = createAabb();

/** @param {object} fixture */
export function readPullFixtureHalfExtents(fixture) {
    if (fixture.halfExtents) return { halfWidth: fixture.halfExtents.x, halfHeight: fixture.halfExtents.y };
    if (fixture.shape?.type === "Polygon") {
        const v = fixture.shape.vertices[0];
        return { halfWidth: Math.abs(v.x), halfHeight: Math.abs(v.y) };
    }
    throw new Error("readPullFixtureHalfExtents requires halfExtents or polygon shape");
}

/** @param {object} entity */
export function isPullPowerTarget(entity) {
    return entity?.triggers?.some((trigger) => trigger.effect === "pull") === true;
}

/** @param {object} state @param {object} fixture */
function buildPullFixtureWalls(state, fixture) {
    const { halfWidth, halfHeight } = readPullFixtureHalfExtents(fixture);
    const grid = state.obstacleGrid;
    const cellSize = grid.cellSize;
    const stamp = padStampBoundsInto(fixtureStampScratch, fixture, halfWidth, halfHeight);
    const originX = grid.minX;
    const originY = grid.minY;
    const halfCell = cellSize * 0.5;
    /** @type {import("../../Entities/Wall.js").Segment[]} */
    const walls = [];
    forEachObstacleGridCellInAabb(grid, stamp, (col, row) => {
        const wall = new Segment(originX + col * cellSize + halfCell, originY + row * cellSize + halfCell, 0, cellSize, 0, 30, 30, false, cellSize);
        wall.collisionOnly = true;
        wall.sandboxFixtureId = fixture.id;
        walls.push(wall);
    });
    return walls;
}

function rebuildPullFixtureNavigation(state) {
    state.hierarchicalNavigator.rebuildRegions(state.viewport.x, state.viewport.y);
    state.navigation.onObstaclesChanged(null);
}

/** @param {object} state @param {object} fixture @param {boolean} wallsUp */
function setPullFixtureWalls(state, fixture, wallsUp) {
    if (!fixture.wallMode || fixture.wallsUp === wallsUp) return;
    if (wallsUp) {
        fixture.walls = buildPullFixtureWalls(state, fixture);
        addSandboxWalls(state, fixture.walls, { notifyNavigation: false });
    } else {
        removeSandboxWalls(state, fixture.walls, { notifyNavigation: false });
        fixture.walls = [];
    }
    rebuildPullFixtureNavigation(state);
    fixture.wallsUp = wallsUp;
}

/** @param {object} state @param {object} fixture */
export function syncPullFixtureWalls(state, fixture) {
    if (!fixture.wallMode) return;
    setPullFixtureWalls(state, fixture, fixture.powered);
}

/** @param {object} state @param {object} fixture */
export function teardownPullFixtureWalls(state, fixture) {
    if (fixture.wallsUp) setPullFixtureWalls(state, fixture, false);
}

/** @param {object} state @param {object} prop */
export function removeSandboxWorldProp(state, prop) {
    if (!prop) return;
    if (isPullPowerTarget(prop)) teardownPullFixtureWalls(state, prop);
    removeWorldPropFromState(state, prop);
}
