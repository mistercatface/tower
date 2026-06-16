/**
 * @param {HTMLElement} container
 * @param {import("../Pipeline/pipelineList.js").PipelineEditorRow[]} rows
 * @param {{
 *   getRowId: (row: import("../Pipeline/pipelineList.js").PipelineEditorRow) => string,
 *   selectedId: string | null,
 *   rowClass?: string,
 *   showEnableToggle?: boolean,
 *   getEnabled?: (row: import("../Pipeline/pipelineList.js").PipelineEditorRow) => boolean,
 *   getLabel: (row: import("../Pipeline/pipelineList.js").PipelineEditorRow, index: number) => string,
 *   getMeta?: (row: import("../Pipeline/pipelineList.js").PipelineEditorRow, index: number) => string | null,
 *   renderExtras?: (row: import("../Pipeline/pipelineList.js").PipelineEditorRow, index: number, item: HTMLElement, extrasSlot: HTMLElement) => void,
 *   onSelect: (rowId: string) => void,
 *   onToggleEnabled?: (row: import("../Pipeline/pipelineList.js").PipelineEditorRow, index: number, enabled: boolean) => void,
 *   onMoveUp?: (index: number) => void,
 *   onMoveDown?: (index: number) => void,
 *   onRemove?: (index: number, row: import("../Pipeline/pipelineList.js").PipelineEditorRow) => void,
 * }} options
 */
export function renderPipelineListUi(container, rows, options) {
    container.innerHTML = "";
    const rowClass = options.rowClass ?? "motif-row";
    const showEnable = options.showEnableToggle !== false && !!options.onToggleEnabled;
    const getEnabled = options.getEnabled ?? ((row) => row.enabled !== false);
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowId = options.getRowId(row);
        const item = document.createElement("div");
        item.className = `${rowClass}${rowId === options.selectedId ? " selected" : ""}`;
        item.dataset.id = rowId;
        const label = options.getLabel(row, i);
        const meta = options.getMeta?.(row, i);
        item.innerHTML = `
            ${showEnable ? `<label class="motif-enable"><input type="checkbox" name="motif-enabled-${rowId}" data-action="toggle" ${getEnabled(row) ? "checked" : ""}></label>` : ""}
            <span class="motif-label">${label}</span>
            ${meta != null ? `<span class="motif-layer">${meta}</span>` : ""}
            <span class="motif-blend-slot"></span>
            <span class="motif-actions">
                <button type="button" data-action="up" title="Move up">↑</button>
                <button type="button" data-action="down" title="Move down">↓</button>
                <button type="button" data-action="remove" title="Remove">✕</button>
            </span>
        `;
        const extrasSlot = /** @type {HTMLElement} */ (item.querySelector(".motif-blend-slot"));
        options.renderExtras?.(row, i, item, extrasSlot);
        item.addEventListener("click", (e) => {
            if (e.target.closest("button") || e.target.closest("input") || e.target.closest("select")) return;
            options.onSelect(rowId);
        });
        if (showEnable)
            item.querySelector('[data-action="toggle"]').addEventListener("change", (e) => {
                options.onToggleEnabled(row, i, /** @type {HTMLInputElement} */ (e.target).checked);
            });
        item.querySelector('[data-action="up"]').addEventListener("click", () => options.onMoveUp?.(i));
        item.querySelector('[data-action="down"]').addEventListener("click", () => options.onMoveDown?.(i));
        item.querySelector('[data-action="remove"]').addEventListener("click", () => options.onRemove?.(i, row));
        container.appendChild(item);
    }
}
