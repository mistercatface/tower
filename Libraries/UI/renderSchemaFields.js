import { getByPath, setByPath } from "../Pipeline/objectPath.js";
import { clampFieldValue } from "../Pipeline/fieldSchema.js";
import { SliderControl } from "./controls/SliderControl.js";
import { SelectControl } from "./controls/SelectControl.js";
/**
 * @param {HTMLElement} container
 * @param {Record<string, unknown>} target
 * @param {import("../Pipeline/fieldSchema.js").FieldDef[]} fields
 * @param {() => void} [onChange]
 */
export function renderSchemaFields(container, target, fields, onChange) {
    for (let i = 0; i < fields.length; i++) {
        const field = fields[i];
        if (field.kind === "boolean") {
            const label = document.createElement("label");
            label.className = "check-inline gen-schema-boolean";
            const input = document.createElement("input");
            input.type = "checkbox";
            input.checked = Boolean(getByPath(target, field.path));
            input.addEventListener("change", () => {
                setByPath(target, field.path, input.checked);
                onChange?.();
            });
            label.appendChild(input);
            label.appendChild(document.createTextNode(` ${field.label}`));
            container.appendChild(label);
            continue;
        }
        if (field.options) {
            const val = getByPath(target, field.path) ?? field.options[0];
            const select = new SelectControl(field.label, field.options, val, (newVal) => {
                setByPath(target, field.path, newVal);
                onChange?.();
            });
            container.appendChild(select.element);
            continue;
        }
        const value = getByPath(target, field.path);
        const num = Number(value ?? 0);
        const slider = new SliderControl(field.label, field.min, field.max, field.step, num, (newVal) => {
            setByPath(target, field.path, clampFieldValue(newVal, field));
            onChange?.();
        });
        container.appendChild(slider.element);
    }
}
