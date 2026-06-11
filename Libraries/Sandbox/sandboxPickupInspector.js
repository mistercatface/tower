/** @param {HTMLElement} parent @param {string} labelText @param {{ value: number, step?: number, min?: number, onChange: (value: number) => void }} opts */
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
    appendNumberField(body, "Facing (°)", { value: Math.round(((pickup.facing ?? 0) * 180) / Math.PI), step: 5, onChange: (degrees) => patch(() => applyPickupFacing(pickup, degrees)) });
}
