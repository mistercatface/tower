import { findWorldPropAtInView } from "../../GameState/EntityRegistry.js";
import { kineticSpatial } from "../../Systems/World/KineticSpatialFrame.js";
import { isFlipperWorldProp } from "./behaviors/flipperBehavior.js";
import { isButtonEntity } from "./buttonInput.js";
import { isSpawnerWorldProp } from "./spawnerConfig.js";
import { formatPropTypeLabel } from "../Props/PropCatalog.js";
import { cellToGlobalColRow } from "../Spatial/grid/gridCellTopology.js";
import { cellInRect } from "../Spatial/grid/GridUtils.js";
import { overlayCircleFillStroke, overlaySegment } from "../Render/overlays/overlayCommands.js";
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
    const prop = findWorldPropAtInView(state.entityRegistry, kineticSpatial, worldX, worldY);
    if (!prop || prop.id === sourceButtonId) return null;
    if (isFlipperWorldProp(prop) || isSpawnerWorldProp(prop)) return { type: "worldProp", id: prop.id };
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
export function appendButtonWireOverlayCommands(out, state, { wireFromPropId = null, wireCursor = null } = {}) {
    forEachButtonEntity(state, (button) => {
        const endpoints = listButtonLinkEndpoints(state, button);
        const color = button.id === wireFromPropId ? "#FFB74D" : "#FF7043";
        for (let j = 0; j < endpoints.length; j++) {
            const endpoint = endpoints[j];
            out.push(overlaySegment(button.x, button.y, endpoint.x, endpoint.y, { stroke: color, lineWidth: 2, dash: [6, 4] }));
            out.push(overlayCircleFillStroke(endpoint.x, endpoint.y, 3, { fill: color, stroke: color, lineWidth: 1 }));
        }
    });
    if (wireFromPropId != null && wireCursor) appendButtonWirePreviewCommands(out, state, wireFromPropId, wireCursor);
}
export function appendButtonWirePreviewCommands(out, state, fromPropId, wireCursor) {
    const from = state.entityRegistry.getLive(fromPropId);
    if (!from) return;
    out.push(overlaySegment(from.x, from.y, wireCursor.x, wireCursor.y, { stroke: "#FFB74D", lineWidth: 2, dash: [6, 4] }));
    out.push(overlayCircleFillStroke(wireCursor.x, wireCursor.y, 3, { fill: "#FFB74D", stroke: "#FFB74D", lineWidth: 1 }));
}
