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
    if (prop.strategy?.isPushable) wakePushableBody(prop);
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
    appendTranslateFields(body, {
        x: prop.x,
        y: prop.y,
        onPatch: (pos) => patch(() => applyWorldPropPosition(prop, pos)),
    });
    appendNumberField(body, "Facing (°)", { value: Math.round(((prop.facing ?? 0) * 180) / Math.PI), step: 5, onChange: (degrees) => patch(() => applyWorldPropFacing(prop, degrees)) });
}
