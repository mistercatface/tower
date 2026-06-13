import { findWorldPropAtInView } from "../../GameState/EntityRegistry.js";
import { fillCircle, strokeCircle, strokeSegment } from "../Canvas/CanvasPath.js";
import { combatSpatial } from "../../Systems/World/CombatSpatialFrame.js";
import { isFlipperWorldProp } from "./behaviors/flipperBehavior.js";
import { isButtonEntity } from "./buttonInput.js";
import { isPullPowerTarget } from "./pullFixtureWalls.js";
import { isSpawnerWorldProp } from "./spawnerConfig.js";
import { formatPropTypeLabel } from "../Props/PropCatalog.js";
import { gridCellToGlobalColRow, gridWallEdgeEndpoints } from "../World/wallGridCells.js";
import { formatGridWallEdgeSideLabel, gridHasForcefield, hitTestRailWallEdgeAtWorld } from "./gridWallEdit.js";
/** @typedef {{ type: "worldProp", id: number }} WorldPropButtonLinkTarget */
/** @typedef {{ type: "gridEdge", globalCol: number, globalRow: number, side: number }} GridEdgeButtonLinkTarget */
/** @typedef {WorldPropButtonLinkTarget | GridEdgeButtonLinkTarget} ButtonLinkTarget */
const WIRE_P1 = { x: 0, y: 0 };
const WIRE_P2 = { x: 0, y: 0 };
/** @param {object} button */
export function getButtonLinks(button) {
    return button.buttonLinks;
}
/** @param {object} button @param {ButtonLinkTarget[]} links */
function setButtonLinks(button, links) {
    button.buttonLinks = links.map((link) => ({ ...link }));
}
/** @param {ButtonLinkTarget} a @param {ButtonLinkTarget} b */
function sameButtonLink(a, b) {
    if (a.type !== b.type) return false;
    if (a.type === "worldProp") return a.id === b.id;
    return a.globalCol === b.globalCol && a.globalRow === b.globalRow && a.side === b.side;
}
/** @param {object} state @param {number} buttonId @param {ButtonLinkTarget} target */
export function addButtonLink(state, buttonId, target) {
    const button = state.entityRegistry.getLive(buttonId);
    if (!isButtonEntity(button)) return false;
    const links = getButtonLinks(button);
    if (links.some((link) => sameButtonLink(link, target))) return true;
    setButtonLinks(button, [...links, target]);
    return true;
}
/** @param {object} state @param {number} buttonId @param {ButtonLinkTarget} target */
export function removeButtonLink(state, buttonId, target) {
    const button = state.entityRegistry.getLive(buttonId);
    if (!isButtonEntity(button)) return false;
    setButtonLinks(
        button,
        getButtonLinks(button).filter((link) => !sameButtonLink(link, target)),
    );
    return true;
}
/** @param {object} state @param {number} buttonId */
export function clearButtonLinks(state, buttonId) {
    const button = state.entityRegistry.getLive(buttonId);
    if (!isButtonEntity(button)) return false;
    button.buttonLinks = [];
    return true;
}
/**
 * @param {object} state
 * @param {number} worldX
 * @param {number} worldY
 */
export function findForcefieldLinkTargetAtWorld(state, worldX, worldY) {
    const grid = state.obstacleGrid;
    const hit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
    if (!hit || !gridHasForcefield(grid, hit.col, hit.row, hit.side)) return null;
    const { globalCol, globalRow } = gridCellToGlobalColRow(grid, hit.col, hit.row);
    return { type: "gridEdge", globalCol, globalRow, side: hit.side };
}
/**
 * @param {object} state
 * @param {number} worldX
 * @param {number} worldY
 * @param {number} sourceButtonId
 */
export function findButtonLinkTarget(state, worldX, worldY, sourceButtonId) {
    const edgeTarget = findForcefieldLinkTargetAtWorld(state, worldX, worldY);
    if (edgeTarget) return edgeTarget;
    const prop = findWorldPropAtInView(state.entityRegistry, combatSpatial, worldX, worldY);
    if (!prop || prop.id === sourceButtonId) return null;
    if (isFlipperWorldProp(prop) || isSpawnerWorldProp(prop) || isPullPowerTarget(prop)) return { type: "worldProp", id: prop.id };
    return null;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} globalCol @param {number} globalRow @param {number} side */
function gridEdgeWireMidpoint(grid, globalCol, globalRow, side) {
    const half = grid.cellSize * 0.5;
    const { col, row } = grid.worldToGrid(globalCol * grid.cellSize + half, globalRow * grid.cellSize + half);
    gridWallEdgeEndpoints(grid, col, row, side, WIRE_P1, WIRE_P2, 0);
    return { x: (WIRE_P1.x + WIRE_P2.x) * 0.5, y: (WIRE_P1.y + WIRE_P2.y) * 0.5 };
}
/** @param {object} state @param {ButtonLinkTarget} target */
export function resolveButtonLinkEndpoint(state, target) {
    if (target.type === "gridEdge") {
        const grid = state.obstacleGrid;
        const { x, y } = gridEdgeWireMidpoint(grid, target.globalCol, target.globalRow, target.side);
        return { target, label: `Forcefield · ${formatGridWallEdgeSideLabel(target.side)}`, x, y };
    }
    const prop = state.entityRegistry.getLive(target.id);
    if (!prop) return null;
    const typeLabel = formatPropTypeLabel(prop.type);
    const role = isSpawnerWorldProp(prop) ? "spawner" : isFlipperWorldProp(prop) ? "flipper" : typeLabel;
    return { target, label: `${role} · #${prop.id}`, x: prop.x, y: prop.y };
}
/** @param {object} state @param {object} button */
export function listButtonLinkEndpoints(state, button) {
    /** @type {{ target: ButtonLinkTarget, label: string, x: number, y: number }[]} */
    const endpoints = [];
    const links = getButtonLinks(button);
    for (let i = 0; i < links.length; i++) {
        const endpoint = resolveButtonLinkEndpoint(state, links[i]);
        if (endpoint) endpoints.push(endpoint);
    }
    return endpoints;
}
/** @param {object} state @param {(button: object) => void} visit */
export function forEachButtonEntity(state, visit) {
    state.entityRegistry.forEachOfKind("worldProp", (prop) => {
        if (prop.isDead || !isButtonEntity(prop)) return;
        visit(prop);
    });
}
/** @param {CanvasRenderingContext2D} ctx @param {object} state @param {{ wireFromPropId?: number | null, wireCursor?: { x: number, y: number } | null }} [options] */
export function drawButtonWires(ctx, state, { wireFromPropId = null, wireCursor = null } = {}) {
    ctx.save();
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    forEachButtonEntity(state, (button) => {
        const endpoints = listButtonLinkEndpoints(state, button);
        const color = button.id === wireFromPropId ? "#FFB74D" : "#FF7043";
        for (let j = 0; j < endpoints.length; j++) drawWire(ctx, button.x, button.y, endpoints[j].x, endpoints[j].y, color);
    });
    if (wireFromPropId != null && wireCursor) {
        const from = state.entityRegistry.getLive(wireFromPropId);
        if (from) drawWire(ctx, from.x, from.y, wireCursor.x, wireCursor.y, "#FFB74D");
    }
    ctx.restore();
}
/** @param {CanvasRenderingContext2D} ctx @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @param {string} color */
function drawWire(ctx, x0, y0, x1, y1, color) {
    ctx.strokeStyle = color;
    strokeSegment(ctx, x0, y0, x1, y1);
    ctx.fillStyle = color;
    fillCircle(ctx, x1, y1, 3);
}
