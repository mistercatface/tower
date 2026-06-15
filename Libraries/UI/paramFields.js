import { SelectControl } from "./controls/SelectControl.js";
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
    const and = document.createElement("span");
    and.className = "param-field-range-word";
    and.textContent = "and";
    const maxSelect = document.createElement("select");
    maxSelect.className = "param-field-range-select";
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
 * @param {Array<{ label: string, selected?: boolean, onSelect?: () => void, onDelete?: () => void }>} entries
 * @param {string} [emptyText]
 */
export function appendInstanceList(parent, entries, emptyText) {
    const list = document.createElement("div");
    list.className = "toy-instance-list";
    if (entries.length === 0) {
        if (emptyText) appendEditorHint(list, emptyText);
        parent.appendChild(list);
        return list;
    }
    for (let i = 0; i < entries.length; i++) appendInstanceListRow(list, entries[i]);
    parent.appendChild(list);
    return list;
}
/** @param {HTMLElement} list @param {{ label: string, selected?: boolean, onSelect?: () => void, onDelete?: () => void }} entry */
function appendInstanceListRow(list, entry) {
    const row = document.createElement("div");
    row.className = `toy-instance-row${entry.selected ? " selected" : ""}`;
    if (entry.onSelect) {
        const selectBtn = document.createElement("button");
        selectBtn.type = "button";
        selectBtn.className = "toy-select-btn";
        selectBtn.textContent = entry.label;
        selectBtn.addEventListener("click", entry.onSelect);
        row.appendChild(selectBtn);
    } else {
        const label = document.createElement("span");
        label.className = "toy-select-btn";
        label.textContent = entry.label;
        row.appendChild(label);
    }
    if (entry.onDelete) {
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "toy-delete-btn secondary";
        deleteBtn.textContent = "Delete";
        deleteBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            entry.onDelete();
        });
        row.appendChild(deleteBtn);
    }
    list.appendChild(row);
}
