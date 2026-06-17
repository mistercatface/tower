import { addWorldPropToState, removeWorldPropFromState } from "../../GameState/EntityRegistry.js";
import { WorldProp } from "../../Entities/WorldProp.js";
import { emptyCellBounds, growCellBounds, isEmptyCellBounds } from "../DataStructures/CellRect.js";
import { PASSAGE_MODE } from "../Spatial/grid/CellEdge.js";
import { setBoundary } from "../Spatial/grid/boundaryOccupancy.js";
import { cellInRect, colRowToIndex, gridSideNeighborCell } from "../Spatial/grid/GridUtils.js";
import { railWallEdgeAt, cellToGlobalColRow } from "../Spatial/grid/gridCellTopology.js";
import { applyPassagePowerGridState } from "../Sandbox/passagePowerNetwork.js";
import { addButtonLink } from "../Sandbox/buttonLinks.js";
import { clearPrimaryBoundaryAt, commitBoundaryEdit } from "../Sandbox/boundaryEdit.js";
import { corridorExteriorCellFromWallHole, roomInteriorCellFromWallHole } from "./roomGraphCorridorBelts.js";
import { roomWallEdgeKey } from "./roomGraphClosedRooms.js";
import { getRoomGraph, listRoomNodes, roomNodeCenterCell, roomNodeContainsCell } from "./roomGraphStore.js";
export const LOCKED_ROOM_KIND = "locked";
/** @typedef {{ col: number, row: number }} GridCell */
/** @typedef {{ col: number, row: number, side: number }} ForcefieldStamp */
/** @typedef {{ c: number, r: number, side: number }} RoomWallHole */
/** @typedef {{ hole: RoomWallHole, mouth: GridCell, power: GridCell, forcefield: ForcefieldStamp }} LockedRoomEgressBake */
/** @typedef {{ nodeId: number, egresses: LockedRoomEgressBake[], buttonId: number | null }} BakedLockedRoom */
/** @param {{ kind?: string } | null | undefined} node */
export function isLockedRoomNode(node) {
    return node?.kind === LOCKED_ROOM_KIND;
}
/** @param {import("./roomGraphStore.js").RoomNode} node @param {GridCell} cell @param {number} egressSide */
export function lockedRoomCellOnPerimeterWall(node, cell, egressSide) {
    if (egressSide === 3) return cell.col === node.col;
    if (egressSide === 1) return cell.col === node.col + node.width - 1;
    if (egressSide === 0) return cell.row === node.row;
    return cell.row === node.row + node.height - 1;
}
/** @param {import("./roomGraphStore.js").RoomNode} node @param {RoomWallHole} hole */
export function resolveLockedRoomPowerCell(node, hole) {
    const tangents = [(hole.side + 1) % 4, (hole.side + 3) % 4];
    for (let i = 0; i < tangents.length; i++) {
        const n = gridSideNeighborCell(hole.c, hole.r, tangents[i]);
        if (!roomNodeContainsCell(node, n.col, n.row)) continue;
        if (n.col === hole.c && n.row === hole.r) continue;
        if (!lockedRoomCellOnPerimeterWall(node, n, hole.side)) continue;
        return { col: n.col, row: n.row };
    }
    throw new Error(`locked room egress ${hole.c},${hole.r},${hole.side}: no perimeter power cell beside hole`);
}
/** @param {import("./roomGraphStore.js").RoomNode} node @param {RoomWallHole} hole */
export function resolveLockedRoomEgressLayout(node, hole) {
    const interior = roomInteriorCellFromWallHole(hole);
    const mouth = { col: interior.c, row: interior.r };
    const power = resolveLockedRoomPowerCell(node, hole);
    const forcefield = { col: hole.c, row: hole.r, side: hole.side };
    return { hole, mouth, power, forcefield };
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {GridCell} power @param {number} egressSide */
export function lockedRoomPowerSharesPerimeterRail(grid, power, egressSide) {
    return railWallEdgeAt(grid, power.col, power.row, egressSide) != null;
}
/** @param {object} state */
export function clearLockedRoomBakes(state) {
    const graph = getRoomGraph(state);
    const bakes = graph.bakedLockedRooms ?? [];
    const bounds = emptyCellBounds();
    for (let i = 0; i < bakes.length; i++) {
        const bake = bakes[i];
        for (let ei = 0; ei < bake.egresses.length; ei++) {
            const { col, row, side } = bake.egresses[ei].forcefield;
            if (clearPrimaryBoundaryAt(state, col, row, side) === "passage") growCellBounds(bounds, col, row);
        }
        for (let ei = 0; ei < bake.egresses.length; ei++) {
            const { col, row } = bake.egresses[ei].power;
            if (!cellInRect(col, row, state.obstacleGrid.cols, state.obstacleGrid.rows)) continue;
            const idx = colRowToIndex(col, row, state.obstacleGrid.cols);
            if (state.obstacleGrid.floorStore.isPassagePowerSourceAtIdx(idx)) {
                state.obstacleGrid.floorStore.clearAtIdx(idx);
                growCellBounds(bounds, col, row);
            }
        }
        if (bake.buttonId != null) {
            const button = state.entityRegistry.getLive(bake.buttonId);
            if (button) removeWorldPropFromState(state, button);
        }
    }
    graph.bakedLockedRooms = [];
    if (!isEmptyCellBounds(bounds)) {
        state.obstacleGrid.edgeStore.recomputePassageEdgeCount();
        applyPassagePowerGridState(state);
        commitBoundaryEdit(state, bounds, { power: true });
    }
}
/** @param {RoomWallHole} hole */
function uniqueHoleKey(hole) {
    return roomWallEdgeKey(hole.c, hole.r, hole.side);
}
/** @param {RoomWallHole[]} holes */
function uniqueEgressHoles(holes) {
    /** @type {RoomWallHole[]} */
    const out = [];
    const seen = new Set();
    for (let i = 0; i < holes.length; i++) {
        const hole = holes[i];
        const key = uniqueHoleKey(hole);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(hole);
    }
    return out;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} side */
function stampLockedRoomForcefieldQuiet(grid, col, row, side) {
    setBoundary(grid, col, row, side, { kind: "passage", mode: PASSAGE_MODE.Solid, allowedSide: side, powered: false });
}
/**
 * @param {object} state
 * @param {{ rooms: { id: number }[], roomNodeById: Map<number, import("./roomGraphStore.js").RoomNode> }} layout
 * @param {import("./roomGraphClosedRooms.js").ClosedRoom[]} closedRooms
 */
export function syncLockedRoomBakes(state, layout, closedRooms) {
    clearLockedRoomBakes(state);
    const grid = state.obstacleGrid;
    /** @type {BakedLockedRoom[]} */
    const bakes = [];
    const bounds = emptyCellBounds();
    const roomNodes = listRoomNodes(state);
    for (let ni = 0; ni < roomNodes.length; ni++) {
        const node = roomNodes[ni];
        if (!isLockedRoomNode(node)) continue;
        let roomIndex = -1;
        for (let ri = 0; ri < layout.rooms.length; ri++)
            if (layout.rooms[ri].id === node.id) {
                roomIndex = ri;
                break;
            }
        if (roomIndex < 0) continue;
        const holes = uniqueEgressHoles(closedRooms[roomIndex].holes);
        if (!holes.length) continue;
        /** @type {LockedRoomEgressBake[]} */
        const egresses = [];
        for (let hi = 0; hi < holes.length; hi++) {
            const layoutForHole = resolveLockedRoomEgressLayout(node, holes[hi]);
            const { power, forcefield } = layoutForHole;
            if (!cellInRect(forcefield.col, forcefield.row, grid.cols, grid.rows)) continue;
            if (!cellInRect(power.col, power.row, grid.cols, grid.rows)) continue;
            stampLockedRoomForcefieldQuiet(grid, forcefield.col, forcefield.row, forcefield.side);
            growCellBounds(bounds, forcefield.col, forcefield.row);
            const idx = colRowToIndex(power.col, power.row, grid.cols);
            grid.floorStore.setPassagePowerSourceAtIdx(idx, true);
            growCellBounds(bounds, power.col, power.row);
            egresses.push(layoutForHole);
        }
        if (!egresses.length) continue;
        const center = roomNodeCenterCell(node);
        const { x, y } = grid.gridToWorld(center.col, center.row);
        const button = new WorldProp(x, y, "button_floor", 0);
        button.inputMode = "massHold";
        button.invert = true;
        addWorldPropToState(state, button);
        for (let ei = 0; ei < egresses.length; ei++) {
            const { globalCol, globalRow } = cellToGlobalColRow(grid, egresses[ei].power.col, egresses[ei].power.row);
            addButtonLink(state, button.id, { type: "gridCell", globalCol, globalRow });
        }
        bakes.push({ nodeId: node.id, egresses, buttonId: button.id });
    }
    getRoomGraph(state).bakedLockedRooms = bakes;
    if (!bakes.length) return;
    grid.edgeStore.recomputePassageEdgeCount();
    applyPassagePowerGridState(state);
    commitBoundaryEdit(state, bounds, { power: true });
}
/** @param {import("./roomGraphStore.js").RoomNode} node @param {LockedRoomEgressBake} egress @param {string} [label] */
export function assertLockedRoomEgressLayout(node, egress, label = "egress") {
    const expected = resolveLockedRoomEgressLayout(node, egress.hole);
    if (egress.mouth.col !== expected.mouth.col || egress.mouth.row !== expected.mouth.row)
        throw new Error(`${label}: mouth expected (${expected.mouth.col},${expected.mouth.row}), got (${egress.mouth.col},${egress.mouth.row})`);
    if (egress.power.col !== expected.power.col || egress.power.row !== expected.power.row)
        throw new Error(`${label}: power expected (${expected.power.col},${expected.power.row}), got (${egress.power.col},${egress.power.row})`);
    if (egress.forcefield.col !== expected.forcefield.col || egress.forcefield.row !== expected.forcefield.row || egress.forcefield.side !== expected.forcefield.side)
        throw new Error(
            `${label}: forcefield expected (${expected.forcefield.col},${expected.forcefield.row},${expected.forcefield.side}), got (${egress.forcefield.col},${egress.forcefield.row},${egress.forcefield.side})`,
        );
    if (egress.power.col === egress.hole.c && egress.power.row === egress.hole.r) throw new Error(`${label}: power source must not occupy the hole cell`);
    if (!lockedRoomCellOnPerimeterWall(node, egress.power, egress.hole.side)) throw new Error(`${label}: power source must sit on the room perimeter wall line`);
    if (egress.forcefield.col !== egress.hole.c || egress.forcefield.row !== egress.hole.r || egress.forcefield.side !== egress.hole.side)
        throw new Error(`${label}: forcefield must cover the corridor hole edge`);
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {import("./roomGraphStore.js").RoomNode} node @param {LockedRoomEgressBake} egress @param {string} [label] */
export function assertLockedRoomPowerOnPerimeterRail(grid, node, egress, label = "egress") {
    assertLockedRoomEgressLayout(node, egress, label);
    if (!lockedRoomPowerSharesPerimeterRail(grid, egress.power, egress.hole.side))
        throw new Error(`${label}: power at (${egress.power.col},${egress.power.row}) must touch perimeter rail side ${egress.hole.side}`);
}
/** @param {LockedRoomEgressBake} egress */
export function lockedRoomCorridorExteriorCell(egress) {
    const exterior = corridorExteriorCellFromWallHole(egress.hole);
    return { col: exterior.c, row: exterior.r };
}
/** @param {LockedRoomEgressBake} egress */
export function lockedRoomHoleCell(egress) {
    return { col: egress.hole.c, row: egress.hole.r };
}
