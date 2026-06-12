import { gridSettings } from "../../../Config/Config.js";
import { formatStampWallHeightLevel, STAMP_WALL_LEVEL_INFINI, STAMP_WALL_LEVEL_MIN } from "../../../Libraries/WorldSurface/stampWallHeight.js";
import { centerCellBoundsOnViewport } from "../world/cellBoundsConfig.js";
import { deleteStaticWallsInBounds, stampStaticWallsInBounds } from "../world/staticGridWallEdit.js";
import { buildRectCircleBoundsFields } from "./cellBoundsFields.js";
import { appendSectionTitle, addNumberField } from "./mapPanelFields.js";
import { SliderControl } from "./controls/SliderControl.js";
/** @param {import("../state.js").TileLabGameState} state @param {HTMLElement} mount @param {() => void} onChanged */
export function buildMapWallToolPanel(state, mount, onChanged) {
    const config = state.editor.wallToolConfig;
    mount.innerHTML = "";
    const onPreviewChange = () => onChanged();
    /** @type {{ input: HTMLInputElement, getValue: () => number }[]} */
    const boundInputs = [];
    const refreshBoundInputs = () => {
        for (let i = 0; i < boundInputs.length; i++) boundInputs[i].input.value = String(boundInputs[i].getValue());
    };
    appendSectionTitle(mount, "Wall tools");
    const hint = document.createElement("p");
    hint.className = "editor-hint";
    hint.textContent = "Red overlay on map overview — drag inside to move, drag edges to resize. Stamp or delete static walls in the selection.";
    mount.appendChild(hint);
    const previewLabel = document.createElement("label");
    previewLabel.className = "check-inline editor-map-preview-toggle";
    const previewInput = document.createElement("input");
    previewInput.type = "checkbox";
    previewInput.checked = state.editor.showMapOverviewWallBounds;
    previewInput.addEventListener("change", () => {
        state.editor.showMapOverviewWallBounds = previewInput.checked;
        onPreviewChange();
    });
    previewLabel.append(previewInput, document.createTextNode(" Show on map overview"));
    mount.appendChild(previewLabel);
    buildRectCircleBoundsFields(mount, config, { onPreviewChange, refreshBoundInputs, boundInputs, addNumberField });
    const syncRow = document.createElement("div");
    syncRow.className = "editor-tools-row";
    const syncBtn = document.createElement("button");
    syncBtn.type = "button";
    syncBtn.className = "secondary";
    syncBtn.textContent = "Center bounds on camera";
    syncBtn.addEventListener("click", () => {
        centerCellBoundsOnViewport(state.viewport, config, gridSettings.cellSize);
        refreshBoundInputs();
        onPreviewChange();
    });
    syncRow.appendChild(syncBtn);
    mount.appendChild(syncRow);
    mount.appendChild(
        new SliderControl(
            "Wall height",
            STAMP_WALL_LEVEL_MIN,
            STAMP_WALL_LEVEL_INFINI,
            1,
            config.wallHeightLevel,
            (val) => {
                config.wallHeightLevel = val;
            },
            (val) => formatStampWallHeightLevel(val),
        ).element,
    );
    const row = document.createElement("div");
    row.className = "editor-tools-row";
    const stampBtn = document.createElement("button");
    stampBtn.type = "button";
    stampBtn.textContent = "Stamp walls";
    stampBtn.addEventListener("click", () => {
        stampStaticWallsInBounds(state, config, config.wallHeightLevel);
        onChanged();
    });
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "secondary";
    deleteBtn.textContent = "Delete walls";
    deleteBtn.addEventListener("click", () => {
        deleteStaticWallsInBounds(state, config);
        onChanged();
    });
    row.append(stampBtn, deleteBtn);
    mount.appendChild(row);
    return { refreshBoundInputs };
}
