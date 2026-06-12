import { wakePushableBody } from "../Motion/pushableSleep.js";
import {
    anchorFloorPropToObstacleGrid,
    findGridAnchoredFloorPropAtCell,
    resizeFloorPropHalfExtents,
    rotateCardinalFloorProp,
    syncFloorPropCollisionShape,
    syncFloorTriggerAabb,
} from "../Spatial/zones/floorShapes.js";
import { syncPullFixtureWalls, teardownPullFixtureWalls } from "./pullFixtureWalls.js";
import { isButtonEntity, isMassButtonInputMode } from "./buttonInput.js";
function appendNumberField(parent, labelText, { value, step = 1, min, onChange }) {
    const field = document.createElement("div");
    field.className = "param-field";
    const label = document.createElement("span");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "number";
    input.step = String(step);
    if (min != null) input.min = String(min);
    input.value = String(value);
    const valueSpan = document.createElement("span");
    valueSpan.className = "param-value";
    valueSpan.textContent = String(value);
    input.addEventListener("change", () => {
        const next = Number(input.value);
        if (!Number.isFinite(next)) {
            input.value = String(value);
            return;
        }
        onChange(next);
        valueSpan.textContent = String(next);
    });
    field.append(label, input, valueSpan);
    parent.appendChild(field);
}
/** @param {object} prop @param {number} degrees */
function applyWorldPropFacing(prop, degrees) {
    prop.facing = (degrees * Math.PI) / 180;
    prop.angularVelocity = 0;
    prop.strategy.syncCollisionShape?.(prop);
}
/** @param {object} prop */
function readPullAlongFacingTrigger(prop) {
    return prop.triggers?.find((trigger) => trigger.effect === "pullAlongFacing");
}
/** @param {object} state @param {object} prop @param {{ x?: number, y?: number }} pos */
function applyGridAnchoredWorldPropPosition(state, prop, { x, y }) {
    const grid = state.obstacleGrid;
    const worldX = x ?? prop.x;
    const worldY = y ?? prop.y;
    const { col, row } = grid.worldToGrid(worldX, worldY);
    if (findGridAnchoredFloorPropAtCell(state.entityRegistry, col, row, prop.id)) return;
    anchorFloorPropToObstacleGrid(prop, grid, worldX, worldY);
}
/** @param {object} prop @param {{ force?: number, rotateSteps?: number }} patch */
function applyGridAnchoredFloorPropPatch(prop, patch) {
    const beltTrigger = readPullAlongFacingTrigger(prop);
    if (patch.force != null && beltTrigger) beltTrigger.force = patch.force;
    if (patch.rotateSteps != null) rotateCardinalFloorProp(prop, patch.rotateSteps);
}
/** @param {object} prop @param {{ x?: number, y?: number }} pos */
function applyWorldPropPosition(prop, { x, y }) {
    if (x != null) prop.x = x;
    if (y != null) prop.y = y;
    if (prop.aabb) syncFloorTriggerAabb(prop);
    if (prop.strategy?.isPushable) wakePushableBody(prop);
}
/** @param {object} prop @param {{ radius?: number, sinkDepth?: number, captureTolerance?: number }} patch */
function applyVoidPitPatch(prop, patch) {
    if (patch.radius != null) {
        prop.radius = patch.radius;
        syncFloorPropCollisionShape(prop);
    }
    if (patch.sinkDepth != null) prop.sinkDepth = patch.sinkDepth;
    if (patch.captureTolerance != null) prop.captureTolerance = patch.captureTolerance;
    if (prop.aabb) syncFloorTriggerAabb(prop);
}
/** @param {object} prop */
function readGravityPullTrigger(prop) {
    return prop.triggers?.find((trigger) => trigger.effect === "pull");
}
function applyGravityPadPatch(state, prop, patch) {
    if (patch.wallMode != null && patch.wallMode !== prop.wallMode) {
        if (prop.wallMode && prop.wallsUp) teardownPullFixtureWalls(state, prop);
        prop.wallMode = patch.wallMode;
        if (!prop.wallMode) {
            prop.walls = [];
            prop.wallsUp = false;
        } else {
            prop.walls = [];
            prop.wallsUp = false;
            syncPullFixtureWalls(state, prop);
        }
    }
    if (patch.halfWidth != null || patch.halfHeight != null) {
        const halfWidth = patch.halfWidth ?? prop.halfExtents.x;
        const halfHeight = patch.halfHeight ?? prop.halfExtents.y;
        if (prop.wallMode && prop.wallsUp) teardownPullFixtureWalls(state, prop);
        resizeFloorPropHalfExtents(prop, halfWidth, halfHeight);
        if (prop.wallMode && prop.wallsUp) syncPullFixtureWalls(state, prop);
    }
    const pullTrigger = readGravityPullTrigger(prop);
    if (!pullTrigger) return;
    if (patch.forceX != null) pullTrigger.forceX = patch.forceX;
    if (patch.forceY != null) pullTrigger.forceY = patch.forceY;
}
/** @param {object} prop @param {{ radius?: number, inputMode?: string, massThreshold?: number, invert?: boolean }} patch */
function applyButtonFloorPatch(prop, patch) {
    if (patch.radius != null) {
        prop.radius = patch.radius;
        syncFloorPropCollisionShape(prop);
        syncFloorTriggerAabb(prop);
    }
    if (patch.inputMode != null) {
        prop.inputMode = patch.inputMode;
        prop._toggleLatched = false;
        prop._massWasActive = false;
        prop._buttonWasActive = false;
    }
    if (patch.massThreshold != null) prop.massThreshold = patch.massThreshold;
    if (patch.invert != null) prop.invert = patch.invert;
}
function appendSelectField(parent, labelText, { value, options, onChange }) {
    const field = document.createElement("div");
    field.className = "param-field";
    const label = document.createElement("span");
    label.textContent = labelText;
    const select = document.createElement("select");
    for (const option of options) {
        const el = document.createElement("option");
        el.value = option.value;
        el.textContent = option.label;
        select.appendChild(el);
    }
    select.value = value;
    select.addEventListener("change", () => onChange(select.value));
    field.append(label, select);
    parent.appendChild(field);
}
/**
 * @param {HTMLElement} body
 * @param {{
 *   listLinks: () => { target: import("./buttonLinks.js").ButtonLinkTarget, label: string }[],
 *   isWireActive: () => boolean,
 *   startWire: () => void,
 *   cancelWire: () => void,
 *   clearLinks: () => void,
 *   removeLink: (target: import("./buttonLinks.js").ButtonLinkTarget) => void,
 * }} wire
 * @param {() => void} onChange
 */
export function appendButtonWireInspector(body, wire, onChange) {
    const links = wire.listLinks();
    const linkHint = document.createElement("p");
    linkHint.className = "editor-hint";
    linkHint.textContent = links.length ? `${links.length} wire${links.length === 1 ? "" : "s"} connected` : "No wires — link to flippers, spawners, or gravity pads.";
    body.appendChild(linkHint);
    if (links.length) {
        const list = document.createElement("div");
        list.className = "toy-instance-list";
        for (const entry of links) {
            const row = document.createElement("div");
            row.className = "toy-instance-row";
            const label = document.createElement("span");
            label.className = "toy-select-btn";
            label.textContent = entry.label;
            row.appendChild(label);
            const deleteBtn = document.createElement("button");
            deleteBtn.type = "button";
            deleteBtn.className = "toy-delete-btn secondary";
            deleteBtn.textContent = "Delete";
            deleteBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                wire.removeLink(entry.target);
                onChange();
            });
            row.appendChild(deleteBtn);
            list.appendChild(row);
        }
        body.appendChild(list);
    }
    const wireRow = document.createElement("div");
    wireRow.className = "sandbox-add-row";
    const wireActive = wire.isWireActive();
    const connectBtn = document.createElement("button");
    connectBtn.type = "button";
    connectBtn.className = wireActive ? "primary" : "secondary";
    connectBtn.textContent = wireActive ? "Click targets to wire…" : "Connect wire";
    connectBtn.addEventListener("click", () => {
        if (wireActive) wire.cancelWire();
        else wire.startWire();
        onChange();
    });
    wireRow.appendChild(connectBtn);
    if (links.length) {
        const clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.className = "secondary";
        clearBtn.textContent = "Clear all";
        clearBtn.addEventListener("click", () => {
            wire.clearLinks();
            onChange();
        });
        wireRow.appendChild(clearBtn);
    }
    body.appendChild(wireRow);
}
/**
 * @param {HTMLElement} body
 * @param {{ x: number, y: number, step?: number, onPatch: (patch: { x?: number, y?: number }) => void }} opts
 */
export function appendTranslateFields(body, { x, y, step = 1, onPatch }) {
    appendNumberField(body, "X", { value: x, step, onChange: (next) => onPatch({ x: next }) });
    appendNumberField(body, "Y", { value: y, step, onChange: (next) => onPatch({ y: next }) });
}
/**
 * @param {HTMLElement} body
 * @param {object} prop
 * @param {{ state: object, sync?: () => void, onChange: () => void }} ctx
 */
export function appendSandboxWorldPropInspectorFields(body, prop, { state, sync, onChange }) {
    const patch = (apply) => {
        apply();
        sync?.();
        onChange();
    };
    const beltTrigger = readPullAlongFacingTrigger(prop);
    if (prop.strategy?.gridAnchored) {
        appendTranslateFields(body, { x: prop.x, y: prop.y, step: state.obstacleGrid.cellSize, onPatch: (pos) => patch(() => applyGridAnchoredWorldPropPosition(state, prop, pos)) });
        const gridField = document.createElement("div");
        gridField.className = "param-field";
        gridField.append(`Grid ${prop.gridCol}, ${prop.gridRow}`);
        body.appendChild(gridField);
        if (prop.strategy.cardinalFacing) {
            const rotateRow = document.createElement("div");
            rotateRow.className = "sandbox-add-row";
            const rotateBtn = document.createElement("button");
            rotateBtn.type = "button";
            rotateBtn.className = "secondary";
            rotateBtn.textContent = "Rotate 90°";
            rotateBtn.addEventListener("click", () => patch(() => applyGridAnchoredFloorPropPatch(prop, { rotateSteps: 1 })));
            rotateRow.appendChild(rotateBtn);
            body.appendChild(rotateRow);
        }
        if (beltTrigger) appendNumberField(body, "Force", { value: beltTrigger.force, step: 50, min: 0, onChange: (force) => patch(() => applyGridAnchoredFloorPropPatch(prop, { force })) });
        return;
    }
    appendTranslateFields(body, { x: prop.x, y: prop.y, onPatch: (pos) => patch(() => applyWorldPropPosition(prop, pos)) });
    const isVoidPit = prop.triggers?.some((trigger) => trigger.effect === "sink");
    const pullTrigger = readGravityPullTrigger(prop);
    if (isVoidPit) {
        appendNumberField(body, "Radius", { value: prop.radius, step: 0.5, min: 0.5, onChange: (radius) => patch(() => applyVoidPitPatch(prop, { radius })) });
        appendNumberField(body, "Depth", { value: prop.sinkDepth, step: 1, min: 1, onChange: (sinkDepth) => patch(() => applyVoidPitPatch(prop, { sinkDepth })) });
        appendNumberField(body, "Capture", { value: prop.captureTolerance, step: 0.05, min: 0, onChange: (captureTolerance) => patch(() => applyVoidPitPatch(prop, { captureTolerance })) });
        return;
    }
    if (isButtonEntity(prop)) {
        appendNumberField(body, "Radius", { value: prop.radius, step: 0.5, min: 0.5, onChange: (radius) => patch(() => applyButtonFloorPatch(prop, { radius })) });
        appendSelectField(body, "Input", {
            value: prop.inputMode,
            options: [
                { value: "tap", label: "Tap" },
                { value: "hold", label: "Hold" },
                { value: "toggle", label: "Toggle" },
                { value: "massTap", label: "Mass – Tap" },
                { value: "massHold", label: "Mass – Hold" },
                { value: "massToggle", label: "Mass – Toggle" },
            ],
            onChange: (inputMode) => patch(() => applyButtonFloorPatch(prop, { inputMode })),
        });
        if (isMassButtonInputMode(prop.inputMode))
            appendNumberField(body, "Mass threshold", { value: prop.massThreshold, step: 0.01, min: 0, onChange: (massThreshold) => patch(() => applyButtonFloorPatch(prop, { massThreshold })) });
        const invertRow = document.createElement("label");
        invertRow.className = "param-field";
        const invertCheck = document.createElement("input");
        invertCheck.type = "checkbox";
        invertCheck.checked = prop.invert;
        invertCheck.addEventListener("change", () => patch(() => applyButtonFloorPatch(prop, { invert: invertCheck.checked })));
        invertRow.append("Invert (NOT) ", invertCheck);
        body.appendChild(invertRow);
        return;
    }
    if (pullTrigger && prop.halfExtents && prop.aabb) {
        appendNumberField(body, "Width", { value: prop.halfExtents.x * 2, step: 1, min: 1, onChange: (width) => patch(() => applyGravityPadPatch(state, prop, { halfWidth: width / 2 })) });
        appendNumberField(body, "Height", { value: prop.halfExtents.y * 2, step: 1, min: 1, onChange: (height) => patch(() => applyGravityPadPatch(state, prop, { halfHeight: height / 2 })) });
        appendNumberField(body, "Force X", { value: pullTrigger.forceX, step: 50, onChange: (forceX) => patch(() => applyGravityPadPatch(state, prop, { forceX })) });
        appendNumberField(body, "Force Y", { value: pullTrigger.forceY, step: 50, onChange: (forceY) => patch(() => applyGravityPadPatch(state, prop, { forceY })) });
        const wallRow = document.createElement("label");
        wallRow.className = "param-field";
        const wallCheck = document.createElement("input");
        wallCheck.type = "checkbox";
        wallCheck.checked = prop.wallMode === true;
        wallCheck.addEventListener("change", () => patch(() => applyGravityPadPatch(state, prop, { wallMode: wallCheck.checked })));
        wallRow.append("Wall mode ", wallCheck);
        body.appendChild(wallRow);
        return;
    }
    appendNumberField(body, "Facing (°)", { value: Math.round(((prop.facing ?? 0) * 180) / Math.PI), step: 5, onChange: (degrees) => patch(() => applyWorldPropFacing(prop, degrees)) });
}
