import { migrateCellBoundsForMode } from "../world/cellBoundsConfig.js";
/**
 * @param {HTMLElement} container
 * @param {import("../world/cellBoundsConfig.js").CellBoundsConfig} config
 * @param {{
 *   onPreviewChange: () => void,
 *   refreshBoundInputs: () => void,
 *   boundInputs: { input: HTMLInputElement, getValue: () => number }[],
 *   addNumberField: (
 *     panel: HTMLElement,
 *     label: string,
 *     getValue: () => number,
 *     setValue: (value: number) => void,
 *     options: { step?: number, min?: number } | undefined,
 *     onPreviewChange: () => void,
 *     boundInputs: { input: HTMLInputElement, getValue: () => number }[],
 *   ) => void,
 * }} options
 */
export function buildRectCircleBoundsFields(container, config, options) {
    const { onPreviewChange, refreshBoundInputs, boundInputs, addNumberField } = options;
    const modeField = document.createElement("label");
    modeField.className = "param-field";
    const modeLabel = document.createElement("span");
    modeLabel.textContent = "Bounds shape";
    const modeSelect = document.createElement("select");
    for (const mode of ["rect", "circle"]) {
        const opt = document.createElement("option");
        opt.value = mode;
        opt.textContent = mode === "rect" ? "Rectangle" : "Circle";
        modeSelect.appendChild(opt);
    }
    modeSelect.value = config.boundsMode === "circle" ? "circle" : "rect";
    modeField.append(modeLabel, modeSelect);
    container.appendChild(modeField);
    const rectFields = document.createElement("div");
    const circleFields = document.createElement("div");
    addNumberField(
        rectFields,
        "Bounds col",
        () => config.boundsCol,
        (v) => {
            config.boundsCol = Math.round(v);
            migrateCellBoundsForMode(config);
        },
        undefined,
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        rectFields,
        "Bounds row",
        () => config.boundsRow,
        (v) => {
            config.boundsRow = Math.round(v);
            migrateCellBoundsForMode(config);
        },
        undefined,
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        rectFields,
        "Bounds cols",
        () => config.boundsCols,
        (v) => {
            config.boundsCols = Math.max(1, Math.round(v));
            migrateCellBoundsForMode(config);
        },
        { min: 1 },
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        rectFields,
        "Bounds rows",
        () => config.boundsRows,
        (v) => {
            config.boundsRows = Math.max(1, Math.round(v));
            migrateCellBoundsForMode(config);
        },
        { min: 1 },
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        circleFields,
        "Center col",
        () => config.centerCol,
        (v) => {
            config.centerCol = Math.round(v);
            migrateCellBoundsForMode(config);
        },
        undefined,
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        circleFields,
        "Center row",
        () => config.centerRow,
        (v) => {
            config.centerRow = Math.round(v);
            migrateCellBoundsForMode(config);
        },
        undefined,
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        circleFields,
        "Radius (cells)",
        () => config.outerRadiusCells,
        (v) => {
            config.outerRadiusCells = Math.max(1, Math.round(v));
            migrateCellBoundsForMode(config);
        },
        { min: 1 },
        onPreviewChange,
        boundInputs,
    );
    const updateModeVisibility = () => {
        rectFields.hidden = config.boundsMode !== "rect";
        circleFields.hidden = config.boundsMode === "rect";
    };
    modeSelect.addEventListener("change", () => {
        config.boundsMode = /** @type {"rect" | "circle"} */ (modeSelect.value);
        migrateCellBoundsForMode(config);
        refreshBoundInputs();
        updateModeVisibility();
        onPreviewChange();
    });
    container.append(rectFields, circleFields);
    updateModeVisibility();
}
