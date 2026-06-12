import { wakePushableBody } from "../Motion/pushableSleep.js";
import { CircleShape } from "../Spatial/collision/Shapes.js";
import { resizeFloorPropHalfExtents, syncFloorTriggerAabb } from "../Spatial/zones/floorShapes.js";
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
        prop.shape = new CircleShape(patch.radius);
    }
    if (patch.sinkDepth != null) prop.sinkDepth = patch.sinkDepth;
    if (patch.captureTolerance != null) prop.captureTolerance = patch.captureTolerance;
    if (prop.aabb) syncFloorTriggerAabb(prop);
}
/** @param {object} prop */
function readGravityPullTrigger(prop) {
    return prop.triggers?.find((trigger) => trigger.effect === "pull");
}
/** @param {object} prop @param {{ halfWidth?: number, halfHeight?: number, forceX?: number, forceY?: number }} patch */
function applyGravityPadPatch(prop, patch) {
    if (patch.halfWidth != null || patch.halfHeight != null) {
        const halfWidth = patch.halfWidth ?? prop.halfExtents.x;
        const halfHeight = patch.halfHeight ?? prop.halfExtents.y;
        resizeFloorPropHalfExtents(prop, halfWidth, halfHeight);
    }
    const pullTrigger = readGravityPullTrigger(prop);
    if (!pullTrigger) return;
    if (patch.forceX != null) pullTrigger.forceX = patch.forceX;
    if (patch.forceY != null) pullTrigger.forceY = patch.forceY;
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
 * @param {{ sync?: () => void, onChange: () => void }} ctx
 */
export function appendSandboxWorldPropInspectorFields(body, prop, { sync, onChange }) {
    const patch = (apply) => {
        apply();
        sync?.();
        onChange();
    };
    appendTranslateFields(body, { x: prop.x, y: prop.y, onPatch: (pos) => patch(() => applyWorldPropPosition(prop, pos)) });
    const isVoidPit = prop.triggers?.some((trigger) => trigger.effect === "sink");
    const pullTrigger = readGravityPullTrigger(prop);
    if (isVoidPit) {
        appendNumberField(body, "Radius", { value: prop.radius, step: 0.5, min: 0.5, onChange: (radius) => patch(() => applyVoidPitPatch(prop, { radius })) });
        appendNumberField(body, "Depth", { value: prop.sinkDepth, step: 1, min: 1, onChange: (sinkDepth) => patch(() => applyVoidPitPatch(prop, { sinkDepth })) });
        appendNumberField(body, "Capture", { value: prop.captureTolerance, step: 0.05, min: 0, onChange: (captureTolerance) => patch(() => applyVoidPitPatch(prop, { captureTolerance })) });
        return;
    }
    if (pullTrigger && prop.halfExtents && prop.aabb) {
        appendNumberField(body, "Width", { value: prop.halfExtents.x * 2, step: 1, min: 1, onChange: (width) => patch(() => applyGravityPadPatch(prop, { halfWidth: width / 2 })) });
        appendNumberField(body, "Height", { value: prop.halfExtents.y * 2, step: 1, min: 1, onChange: (height) => patch(() => applyGravityPadPatch(prop, { halfHeight: height / 2 })) });
        appendNumberField(body, "Force X", { value: pullTrigger.forceX, step: 50, onChange: (forceX) => patch(() => applyGravityPadPatch(prop, { forceX })) });
        appendNumberField(body, "Force Y", { value: pullTrigger.forceY, step: 50, onChange: (forceY) => patch(() => applyGravityPadPatch(prop, { forceY })) });
        return;
    }
    appendNumberField(body, "Facing (°)", { value: Math.round(((prop.facing ?? 0) * 180) / Math.PI), step: 5, onChange: (degrees) => patch(() => applyWorldPropFacing(prop, degrees)) });
}
