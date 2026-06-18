import { SelectControl } from "./controls/SelectControl.js";
import { setFormFieldName } from "./Component.js";
import { normalizePickerHex } from "../Color/hex.js";
/** @param {HTMLElement} parent @param {string} text @param {{ tag?: keyof HTMLElementTagNameMap }} [opts] */
export function appendEditorSubhead(parent, text, { tag = "div" } = {}) {
    const head = document.createElement(tag);
    head.className = "editor-subhead";
    head.textContent = text;
    parent.appendChild(head);
    return head;
}
/** @param {HTMLElement} parent @param {string} text */
export function appendEditorHint(parent, text) {
    const hint = document.createElement("p");
    hint.className = "editor-hint";
    hint.textContent = text;
    parent.appendChild(hint);
    return hint;
}
/** @param {HTMLElement} parent @param {string} labelText @param {{ value: number, step?: number, min?: number, max?: number, onChange: (value: number) => void }} opts */
export function appendNumberField(parent, labelText, { value, step = 1, min, max, onChange }) {
    const field = document.createElement("div");
    field.className = "param-field";
    const label = document.createElement("span");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "number";
    setFormFieldName(input, labelText);
    input.step = String(step);
    if (min != null) input.min = String(min);
    if (max != null) input.max = String(max);
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
/** @param {HTMLElement} parent @param {string} labelText @param {{ minValue: number, maxValue: number, floor?: number, ceiling: number, onMinChange: (value: number) => void, onMaxChange: (value: number) => void }} opts */
export function appendNumberRangeField(parent, labelText, { minValue, maxValue, floor = 1, ceiling, onMinChange, onMaxChange }) {
    const cap = Math.max(floor, ceiling);
    const field = document.createElement("div");
    field.className = "param-field param-field-range";
    const label = document.createElement("span");
    label.className = "param-field-range-label";
    label.textContent = `${labelText}:`;
    const between = document.createElement("span");
    between.className = "param-field-range-word";
    between.textContent = "between";
    const minSelect = document.createElement("select");
    minSelect.className = "param-field-range-select";
    setFormFieldName(minSelect, `${labelText}_min`);
    const and = document.createElement("span");
    and.className = "param-field-range-word";
    and.textContent = "and";
    const maxSelect = document.createElement("select");
    maxSelect.className = "param-field-range-select";
    setFormFieldName(maxSelect, `${labelText}_max`);
    const fillSelect = (select, value) => {
        select.replaceChildren();
        for (let v = floor; v <= cap; v++) {
            const option = document.createElement("option");
            option.value = String(v);
            option.textContent = String(v);
            if (v === value) option.selected = true;
            select.appendChild(option);
        }
    };
    fillSelect(minSelect, minValue);
    fillSelect(maxSelect, maxValue);
    minSelect.addEventListener("change", () => onMinChange(Number(minSelect.value)));
    maxSelect.addEventListener("change", () => onMaxChange(Number(maxSelect.value)));
    field.append(label, between, minSelect, and, maxSelect);
    parent.appendChild(field);
}
/**
 * @param {HTMLElement} parent
 * @param {string} labelText
 * @param {{ value: string, options: { value: string, label: string }[], onChange: (value: string) => void }} opts
 */
export function appendSelectField(parent, labelText, { value, options, onChange }) {
    const control = new SelectControl(labelText, options, value, onChange);
    parent.appendChild(control.element);
    return control;
}
export function appendActionRow(parent, buttons, { className = "sandbox-add-row" } = {}) {
    const row = document.createElement("div");
    row.className = className;
    for (let i = 0; i < buttons.length; i++) {
        const spec = buttons[i];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = spec.variant ?? "secondary";
        btn.textContent = spec.label;
        btn.addEventListener("click", spec.onClick);
        row.appendChild(btn);
    }
    parent.appendChild(row);
    return row;
}
export function appendCheckboxField(parent, label, { name, checked, onChange, className = "param-field check-inline" }) {
    const field = document.createElement("label");
    field.className = className;
    const input = document.createElement("input");
    input.type = "checkbox";
    if (name) setFormFieldName(input, name);
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    field.append(input, document.createTextNode(` ${label}`));
    parent.appendChild(field);
    return field;
}
export function appendColorField(parent, labelText, { value, onChange }) {
    const field = document.createElement("div");
    field.className = "param-field param-field-color";
    const label = document.createElement("span");
    label.textContent = labelText;
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "param-color-swatch";
    swatch.title = "Pick color";
    const hexLabel = document.createElement("span");
    hexLabel.className = "param-value param-color-hex";
    const popover = document.createElement("div");
    popover.className = "param-color-popover";
    popover.hidden = true;
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.className = "param-color-popover-input";
    setFormFieldName(colorInput, `${labelText}_picker`);
    const hexInput = document.createElement("input");
    hexInput.type = "text";
    hexInput.className = "param-color-hex-input";
    hexInput.autocomplete = "off";
    hexInput.spellcheck = false;
    setFormFieldName(hexInput, `${labelText}_hex`);
    const doneBtn = document.createElement("button");
    doneBtn.type = "button";
    doneBtn.className = "secondary param-color-done";
    doneBtn.textContent = "Done";
    let currentHex = normalizePickerHex(value) ?? "#888888";
    const syncDisplay = (hex) => {
        currentHex = hex;
        colorInput.value = hex;
        swatch.style.backgroundColor = hex;
        hexLabel.textContent = hex;
        hexInput.value = hex;
    };
    const apply = (hex) => {
        const normalized = normalizePickerHex(hex);
        if (!normalized) return;
        syncDisplay(normalized);
        onChange(normalized);
    };
    const closePopover = () => {
        apply(colorInput.value);
        popover.hidden = true;
    };
    syncDisplay(currentHex);
    swatch.addEventListener("click", () => {
        if (popover.hidden) {
            syncDisplay(currentHex);
            popover.hidden = false;
        } else closePopover();
    });
    colorInput.addEventListener("input", () => apply(colorInput.value));
    hexInput.addEventListener("input", () => {
        const normalized = normalizePickerHex(hexInput.value);
        if (normalized) apply(normalized);
    });
    hexInput.addEventListener("change", () => {
        const normalized = normalizePickerHex(hexInput.value);
        if (normalized) apply(normalized);
        else hexInput.value = currentHex;
    });
    doneBtn.addEventListener("click", closePopover);
    popover.append(colorInput, hexInput, doneBtn);
    const picker = document.createElement("div");
    picker.className = "param-color-picker";
    picker.append(swatch, popover);
    field.append(label, picker, hexLabel);
    parent.appendChild(field);
    return field;
}
/**
 * @param {HTMLElement} body
 * @param {Record<string, { value: number, step?: number, min?: number, onChange: (value: number) => void }>} axes
 */
export function appendAxisNumberFields(body, axes) {
    for (const [label, opts] of Object.entries(axes)) appendNumberField(body, label, opts);
}
/**
 * @param {HTMLElement} body
 * @param {{ x: number, y: number, step?: number, onPatch: (patch: { x?: number, y?: number }) => void }} opts
 */
export function appendTranslateFields(body, { x, y, step = 1, onPatch }) {
    appendAxisNumberFields(body, { X: { value: x, step, onChange: (next) => onPatch({ x: next }) }, Y: { value: y, step, onChange: (next) => onPatch({ y: next }) } });
}
/**
 * @param {HTMLElement} parent
 * @param {{ label: string, selected?: boolean, onSelect?: () => void, onDelete?: () => void }[]} items
 * @param {string} [emptyLabel]
 */
export function appendInstanceList(parent, items, emptyLabel = "None") {
    const list = document.createElement("div");
    list.className = "toy-instance-list";
    if (items.length === 0) {
        const empty = document.createElement("div");
        empty.className = "toy-instance-empty";
        empty.textContent = emptyLabel;
        list.appendChild(empty);
    } else {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const row = document.createElement("div");
            row.className = "toy-instance-row";
            if (item.selected) row.classList.add("is-selected");
            const labelBtn = document.createElement("button");
            labelBtn.type = "button";
            labelBtn.className = "toy-instance-label";
            labelBtn.textContent = item.label;
            if (item.onSelect) labelBtn.addEventListener("click", item.onSelect);
            else labelBtn.disabled = true;
            row.appendChild(labelBtn);
            if (item.onDelete) {
                const deleteBtn = document.createElement("button");
                deleteBtn.type = "button";
                deleteBtn.className = "toy-instance-delete";
                deleteBtn.textContent = "×";
                deleteBtn.title = "Delete";
                deleteBtn.addEventListener("click", item.onDelete);
                row.appendChild(deleteBtn);
            }
            list.appendChild(row);
        }
    }
    parent.appendChild(list);
    return list;
}
