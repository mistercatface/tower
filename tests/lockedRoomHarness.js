import "./nodeCanvasSetup.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import button_floor from "../Assets/props/button_floor/button_floor.asset.js";
import blue_ball from "../Assets/props/blue_ball/blue_ball.asset.js";
import { setPropCatalog } from "../Libraries/Props/PropCatalog.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { getGameWorldSurfaceSettings } from "../Render/WorldSurfaceBootstrap.js";
import { boundaryBlocksStepFrom, isPassagePowered } from "../Libraries/Spatial/grid/boundaryOccupancy.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { applyPassagePowerGridState } from "../Libraries/Sandbox/passagePowerNetwork.js";
import { addRoomLink, addRoomNode, getRoomGraph, getRoomNode, listRoomLinks } from "../Libraries/RoomGraph/roomGraphStore.js";
import { syncRoomGraphBake } from "../Libraries/RoomGraph/roomGraphBake.js";
import { CORRIDOR_TYPE_LOCKED_ROOM } from "../Libraries/RoomGraph/roomGraphCorridorTypes.js";
import { assertLockedRoomPowerOnPerimeterRail, lockedRoomCorridorExteriorCell, lockedRoomHoleCell, lockedRoomCellOnPerimeterWall } from "../Libraries/RoomGraph/roomGraphLockedRoom.js";
import { WorldProp } from "../Entities/WorldProp.js";
import { addWorldPropToState } from "../GameState/EntityRegistry.js";
function assetDefinition(asset) {
    const { id, physics } = asset;
    const { hitBehavior, spawn, renderMode, ...strategy } = physics;
    return { render3DKey: id, renderMode: renderMode ?? "3d", hitBehavior, spawn, inspectKey: null, ...strategy };
}
let propsLoaded = false;
function ensurePropCatalog() {
    if (propsLoaded) return;
    const catalog = [button_floor, blue_ball];
    const definitions = {};
    const recipes = {};
    const assets = {};
    for (let i = 0; i < catalog.length; i++) {
        const asset = catalog[i];
        definitions[asset.id] = assetDefinition(asset);
        recipes[asset.id] = () => {};
        assets[asset.id] = asset;
    }
    setPropCatalog({ definitions, recipes, assets });
    propsLoaded = true;
}
export function createRoomBakeTestState(cols = 64, rows = 64) {
    ensurePropCatalog();
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    return {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        sandbox: new SandboxWorldState(),
        worldSurfaces: { settings: getGameWorldSurfaceSettings(), invalidateGridBounds: () => {} },
        navigation: { onObstaclesChanged: async () => {} },
    };
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {import("../Libraries/RoomGraph/roomGraphLockedRoom.js").LockedRoomEgressBake} egress @param {boolean} sealed */
export function assertLockedExitSealed(grid, egress, sealed, label = "exit") {
    const exterior = lockedRoomCorridorExteriorCell(egress);
    const holeCell = lockedRoomHoleCell(egress);
    const powered = isPassagePowered(grid, egress.forcefield.col, egress.forcefield.row, egress.forcefield.side);
    const corridorToHole = boundaryBlocksStepFrom(grid, exterior.col, exterior.row, holeCell.col, holeCell.row);
    const holeToCorridor = boundaryBlocksStepFrom(grid, holeCell.col, holeCell.row, exterior.col, exterior.row);
    if (sealed) {
        if (egress.forcefield.col !== egress.hole.c || egress.forcefield.row !== egress.hole.r || egress.forcefield.side !== egress.hole.side)
            throw new Error(`${label}: forcefield is not on the corridor hole edge`);
        if (!powered) throw new Error(`${label}: expected powered forcefield on hole edge (${egress.hole.c},${egress.hole.r},${egress.hole.side})`);
        if (!corridorToHole) throw new Error(`${label}: corridor (${exterior.col},${exterior.row}) must not enter hole (${holeCell.col},${holeCell.row})`);
        if (!holeToCorridor) throw new Error(`${label}: hole (${holeCell.col},${holeCell.row}) must not reach corridor (${exterior.col},${exterior.row})`);
        return;
    }
    if (powered) throw new Error(`${label}: expected unpowered forcefield on hole edge`);
    if (corridorToHole) throw new Error(`${label}: corridor (${exterior.col},${exterior.row}) should enter hole (${holeCell.col},${holeCell.row})`);
    if (holeToCorridor) throw new Error(`${label}: hole (${holeCell.col},${holeCell.row}) should reach corridor (${exterior.col},${exterior.row})`);
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {import("../Libraries/RoomGraph/roomGraphLockedRoom.js").BakedLockedRoom} bake @param {boolean} sealed @param {string} [label] */
export function assertLockedRoomSealed(grid, bake, sealed, label = "room") {
    for (let i = 0; i < bake.egresses.length; i++) assertLockedExitSealed(grid, bake.egresses[i], sealed, `${label} lane ${i}`);
}
/** @param {object} state @param {import("../Libraries/RoomGraph/roomGraphLockedRoom.js").BakedLockedRoom} bake */
export function assertLockedRoomEgressPlacements(state, bake) {
    const node = getRoomNode(state, bake.nodeId);
    const grid = state.obstacleGrid;
    for (let i = 0; i < bake.egresses.length; i++) {
        const egress = bake.egresses[i];
        assertLockedRoomPowerOnPerimeterRail(grid, node, egress, `lane ${i}`);
        if (!lockedRoomCellOnPerimeterWall(node, egress.power, egress.hole.side)) throw new Error(`lane ${i}: power must sit on perimeter wall line`);
        const powerIdx = colRowToIndex(egress.power.col, egress.power.row, grid.cols);
        if (!grid.floorStore.isPassagePowerSourceAtIdx(powerIdx)) throw new Error(`lane ${i}: missing passage power source at (${egress.power.col},${egress.power.row})`);
        if (grid.floorStore.isPassagePowerSourceAtIdx(colRowToIndex(egress.hole.c, egress.hole.r, grid.cols))) throw new Error(`lane ${i}: hole cell must not host the power source`);
        if (egress.forcefield.col !== egress.hole.c || egress.forcefield.row !== egress.hole.r || egress.forcefield.side !== egress.hole.side)
            throw new Error(`lane ${i}: forcefield must stamp hole edge (${egress.hole.c},${egress.hole.r},${egress.hole.side})`);
    }
}
/**
 * @param {object} state
 * @param {ReturnType<typeof import("./corridorHarness.js").makeHorizontalFixture>} fixture
 * @param {number} [linkSeed]
 */
export function bakeLinkedLockedRoomFixture(state, fixture, linkSeed = 0) {
    const locked = addRoomNode(state, { col: fixture.roomA.c0, row: fixture.roomA.r0, width: fixture.roomA.c1 - fixture.roomA.c0 + 1, height: fixture.roomA.r1 - fixture.roomA.r0 + 1 });
    const open = addRoomNode(state, { col: fixture.roomB.c0, row: fixture.roomB.r0, width: fixture.roomB.c1 - fixture.roomB.c0 + 1, height: fixture.roomB.r1 - fixture.roomB.r0 + 1 });
    addRoomLink(state, locked.id, open.id, { corridorType: CORRIDOR_TYPE_LOCKED_ROOM });
    const link = listRoomLinks(state)[0];
    link.seed = linkSeed;
    syncRoomGraphBake(state);
    return { locked, open, link };
}
/** @param {object} state @param {number} nodeId */
export function getLockedRoomBake(state, nodeId) {
    const bakes = getRoomGraph(state).bakedLockedRooms ?? [];
    for (let i = 0; i < bakes.length; i++) if (bakes[i].nodeId === nodeId) return bakes[i];
    return null;
}
export function refreshPassagePower(state) {
    applyPassagePowerGridState(state);
}
/** @param {object} state @param {number} buttonId */
export function holdLockedRoomButton(state, buttonId) {
    const button = state.entityRegistry.getLive(buttonId);
    const weight = new WorldProp(button.x, button.y, "blue_ball", 0);
    addWorldPropToState(state, weight);
    button._occupants.add(weight.id);
}
/** @param {object} state @param {number} buttonId */
export function releaseLockedRoomButton(state, buttonId) {
    const button = state.entityRegistry.getLive(buttonId);
    button._occupants.clear();
}
