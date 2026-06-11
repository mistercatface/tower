import { wakePushableBody } from "../Motion/pushableSleep.js";
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
/** @param {object} pickup @param {number} degrees */
function applyPickupFacing(pickup, degrees) {
    pickup.facing = (degrees * Math.PI) / 180;
    pickup.angularVelocity = 0;
    pickup.strategy.syncCollisionShape?.(pickup);
}
/** @param {object} pickup @param {{ x?: number, y?: number }} pos */
function applyPickupPosition(pickup, { x, y }) {
    if (x != null) pickup.x = x;
    if (y != null) pickup.y = y;
    if (pickup.strategy?.isPushable) wakePushableBody(pickup);
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
 * @param {object} pickup
 * @param {{ sync?: () => void, onChange: () => void }} ctx
 */
export function appendSandboxPickupInspectorFields(body, pickup, { sync, onChange }) {
    const patch = (apply) => {
        apply();
        sync?.();
        onChange();
    };
    appendTranslateFields(body, {
        x: pickup.x,
        y: pickup.y,
        onPatch: (pos) => patch(() => applyPickupPosition(pickup, pos)),
    });
    appendNumberField(body, "Facing (°)", { value: Math.round(((pickup.facing ?? 0) * 180) / Math.PI), step: 5, onChange: (degrees) => patch(() => applyPickupFacing(pickup, degrees)) });
}
