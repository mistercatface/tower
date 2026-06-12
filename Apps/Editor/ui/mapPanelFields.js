/** @param {HTMLElement} panel @param {string} title */
export function appendSectionTitle(panel, title) {
    const heading = document.createElement("div");
    heading.className = "editor-block-title";
    heading.textContent = title;
    panel.appendChild(heading);
}
/**
 * @param {HTMLElement} panel
 * @param {string} label
 * @param {() => number} getValue
 * @param {(value: number) => void} setValue
 * @param {{ step?: number, min?: number } | undefined} options
 * @param {() => void} onPreviewChange
 * @param {{ input: HTMLInputElement, getValue: () => number }[]} boundInputs
 */
export function addNumberField(panel, label, getValue, setValue, options, onPreviewChange, boundInputs) {
    const { step = 1, min = -999999 } = options ?? {};
    const field = document.createElement("label");
    field.className = "param-field";
    const labelSpan = document.createElement("span");
    labelSpan.textContent = label;
    const input = document.createElement("input");
    input.type = "number";
    input.step = String(step);
    input.min = String(min);
    input.value = String(getValue());
    field.append(labelSpan, input);
    panel.appendChild(field);
    input.addEventListener("change", () => {
        const parsed = Number(input.value);
        if (!Number.isFinite(parsed)) {
            input.value = String(getValue());
            return;
        }
        setValue(parsed);
        input.value = String(getValue());
        onPreviewChange();
    });
    boundInputs.push({ input, getValue });
}
