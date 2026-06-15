import { findWorldPropAtInView } from "../../GameState/EntityRegistry.js";
import { fillCircle, strokeCircle, strokeSegment } from "../Canvas/CanvasPath.js";
import { combatSpatial } from "../../Systems/World/CombatSpatialFrame.js";
import { isFlipperWorldProp } from "./behaviors/flipperBehavior.js";
import { isButtonEntity } from "./buttonInput.js";
import { isPullPowerTarget } from "./pullFixtureWalls.js";
import { isSpawnerWorldProp } from "./spawnerConfig.js";
import { formatPropTypeLabel } from "../Props/PropCatalog.js";
import { cellToGlobalColRow } from "../Spatial/grid/gridCellTopology.js";
import { cellInRect } from "../Spatial/grid/GridUtils.js";
/** @typedef {{ type: "worldProp", id: number }} WorldPropButtonLinkTarget */
/** @typedef {{ type: "gridCell", globalCol: number, globalRow: number }} GridCellButtonLinkTarget */
/** @typedef {WorldPropButtonLinkTarget | GridCellButtonLinkTarget} ButtonLinkTarget */
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
    return a.globalCol === b.globalCol && a.globalRow === b.globalRow;
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
export function findPassagePowerSourceLinkTargetAtWorld(state, worldX, worldY) {
    const grid = state.obstacleGrid;
    const { col, row } = grid.worldToGrid(worldX, worldY);
    if (!cellInRect(col, row, grid.cols, grid.rows)) return null;
    const idx = col + row * grid.cols;
    if (!grid.floorStore.isPassagePowerSourceAtIdx(idx)) return null;
    const { globalCol, globalRow } = cellToGlobalColRow(grid, col, row);
    return { type: "gridCell", globalCol, globalRow };
}
/**
 * @param {object} state
 * @param {number} worldX
 * @param {number} worldY
 * @param {number} sourceButtonId
 */
export function findButtonLinkTarget(state, worldX, worldY, sourceButtonId) {
    const sourceTarget = findPassagePowerSourceLinkTargetAtWorld(state, worldX, worldY);
    if (sourceTarget) return sourceTarget;
    const prop = findWorldPropAtInView(state.entityRegistry, combatSpatial, worldX, worldY);
    if (!prop || prop.id === sourceButtonId) return null;
    if (isFlipperWorldProp(prop) || isSpawnerWorldProp(prop) || isPullPowerTarget(prop)) return { type: "worldProp", id: prop.id };
    return null;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} globalCol @param {number} globalRow */
function gridCellWireMidpoint(grid, globalCol, globalRow) {
    const half = grid.cellHalfSize;
    const { col, row } = grid.worldToGrid(globalCol * grid.cellSize + half, globalRow * grid.cellSize + half);
    const { x, y } = grid.gridToWorld(col, row);
    return { x, y };
}
/** @param {object} state @param {ButtonLinkTarget} target */
export function resolveButtonLinkEndpoint(state, target) {
    if (target.type === "gridCell") {
        const grid = state.obstacleGrid;
        const { x, y } = gridCellWireMidpoint(grid, target.globalCol, target.globalRow);
        return { target, label: "Power source", x, y };
    }
    if (target.type !== "worldProp") return null;
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
